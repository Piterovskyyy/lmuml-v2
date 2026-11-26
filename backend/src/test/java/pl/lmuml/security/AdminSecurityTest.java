package pl.lmuml.security;

import java.util.Map;
import java.util.UUID;

import jakarta.servlet.Filter;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import pl.lmuml.player.PlayerPrincipal;
import pl.lmuml.player.PlayerUserDetailsService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpStatus.CREATED;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminSecurityTest {

    private static final String PLAYER_PATH = "/api/v1/player";
    private static final String TEST_EMAIL = "gracz@example.test";
    private static final UUID TEST_PLAYER_ID = UUID.fromString("8d9e4f0c-62a0-43d3-8ca3-732e9e55024d");
    private static final String TEST_PASSWORD = "only-a-synthetic-test-password";
    // Synthetic PBKDF2 fixture generated with Node's crypto.pbkdf2 and a fixed test-only salt.
    private static final String TEST_HASH = "7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a"
            + "4ce8e3140c2da1d02f60be6c26d607c6eda675a1b1a19e0b4f4f4ac963ba9dc4";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void protectsAdminWritesWithSessionAndCsrfAndRotatesTheSessionOnLogin() throws Exception {
        try (var context = webContext(TEST_HASH)) {
            MockMvc mvc = mvc(context);
            mvc.perform(get("/api/probe")).andExpect(status().isOk());
            mvc.perform(get("/api/admin/check")).andExpect(status().isUnauthorized());

            MvcResult anonymous = mvc.perform(get("/api/admin/session"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                    .andReturn();
            JsonNode anonymousBody = body(anonymous);
            assertThat(anonymousBody.path("authenticated").asBoolean()).isFalse();
            String anonymousToken = anonymousBody.path("csrfToken").asString();
            var session = (MockHttpSession) anonymous.getRequest().getSession(false);
            assertThat(session).isNotNull();
            String initialSessionId = session.getId();

            mvc.perform(post("/api/admin/login").session(session)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("username", "admin").param("password", TEST_PASSWORD))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/login").session(session).header("X-CSRF-TOKEN", anonymousToken)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("username", "admin").param("password", "incorrect"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/admin/login").session(session).header("X-CSRF-TOKEN", anonymousToken)
                    .with(request -> {
                        request.setRequestedSessionId(initialSessionId);
                        request.setRequestedSessionIdValid(true);
                        return request;
                    })
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("username", "admin").param("password", TEST_PASSWORD))
                    .andExpect(status().isNoContent());
            assertThat(session.getId()).isNotEqualTo(initialSessionId);

            mvc.perform(get("/api/admin/check").session(session)).andExpect(status().isOk());
            mvc.perform(post("/api/admin/check").session(session)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/check").session(session).header("X-CSRF-TOKEN", anonymousToken))
                    .andExpect(status().isForbidden());
            JsonNode loggedIn = body(mvc.perform(get("/api/admin/session").session(session))
                    .andExpect(status().isOk()).andReturn());
            assertThat(loggedIn.path("authenticated").asBoolean()).isTrue();
            String token = loggedIn.path("csrfToken").asString();
            mvc.perform(post("/api/admin/check").session(session).header("X-CSRF-TOKEN", token))
                    .andExpect(status().isOk());

            mvc.perform(post("/api/admin/logout").session(session)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/logout").session(session).header("X-CSRF-TOKEN", token))
                    .andExpect(status().isNoContent());
            assertThat(session.isInvalid()).isFalse();
            mvc.perform(get("/api/admin/check").session(session)).andExpect(status().isUnauthorized());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "wrong-format"})
    void keepsTheAdminNamespaceDisabledWithoutAValidHash(String hash) throws Exception {
        try (var context = webContext(hash)) {
            MockMvc mvc = mvc(context);
            mvc.perform(get("/api/probe")).andExpect(status().isOk());
            mvc.perform(get("/api/admin")).andExpect(status().isNotFound());
            mvc.perform(get("/api/admin/session")).andExpect(status().isNotFound());
            mvc.perform(post("/api/admin/login")).andExpect(status().isNotFound());
            mvc.perform(get("/api/admin/check")).andExpect(status().isNotFound());
        }
    }

    @Test
    void keepsDisabledPlayerEndpointsUnavailable() throws Exception {
        try (var context = webContext(TEST_HASH)) {
            MockMvc mvc = mvc(context);
            mvc.perform(get(PLAYER_PATH)).andExpect(status().isNotFound());
            mvc.perform(get(PLAYER_PATH + "/session")).andExpect(status().isNotFound());
            mvc.perform(post(PLAYER_PATH + "/register")).andExpect(status().isNotFound());
            mvc.perform(post(PLAYER_PATH + "/login")).andExpect(status().isNotFound());
            mvc.perform(get("/api/admin/session")).andExpect(status().isOk());
        }
    }

    @Test
    void separatesPlayerIdentityAndCsrfFromAdminWithinOneBrowserSession() throws Exception {
        try (var context = webContext(TEST_HASH, true)) {
            MockMvc mvc = mvc(context);
            var adminBootstrap = mvc.perform(get("/api/admin/session")).andExpect(status().isOk()).andReturn();
            var session = (MockHttpSession) adminBootstrap.getRequest().getSession(false);
            mvc.perform(login("/api/admin", "admin", session, body(adminBootstrap).path("csrfToken").asString()))
                    .andExpect(status().isNoContent());
            String adminToken = body(mvc.perform(get("/api/admin/session").session(session)).andReturn())
                    .path("csrfToken").asString();

            mvc.perform(get(PLAYER_PATH + "/check").session(session)).andExpect(status().isUnauthorized());
            JsonNode anonymous = body(mvc.perform(get(PLAYER_PATH + "/session").session(session))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                    .andReturn());
            assertThat(anonymous.path("authenticated").asBoolean()).isFalse();
            assertThat(anonymous.path("player").isNull()).isTrue();
            String anonymousPlayerToken = anonymous.path("csrfToken").asString();
            mvc.perform(post(PLAYER_PATH + "/register").session(session).header("X-CSRF-TOKEN", adminToken))
                    .andExpect(status().isForbidden());
            mvc.perform(post(PLAYER_PATH + "/register").session(session).header("X-CSRF-TOKEN", anonymousPlayerToken))
                    .andExpect(status().isCreated());
            mvc.perform(login(PLAYER_PATH, "unknown@example.test", session, anonymousPlayerToken))
                    .andExpect(status().isUnauthorized());

            String beforePlayerLogin = session.getId();
            mvc.perform(login(PLAYER_PATH, TEST_EMAIL, session, anonymousPlayerToken)).andExpect(status().isNoContent());
            assertThat(session.getId()).isNotEqualTo(beforePlayerLogin);
            JsonNode signedIn = body(mvc.perform(get(PLAYER_PATH + "/session").session(session))
                    .andExpect(status().isOk()).andReturn());
            assertThat(signedIn.path("authenticated").asBoolean()).isTrue();
            assertThat(signedIn.path("player").path("id").asString()).isEqualTo(TEST_PLAYER_ID.toString());
            assertThat(signedIn.path("player").path("email").asString()).isEqualTo(TEST_EMAIL);
            assertThat(signedIn.path("player").path("displayName").asString()).isEqualTo("Kibic");
            assertThat(signedIn.path("player").size()).isEqualTo(3);
            String playerToken = signedIn.path("csrfToken").asString();

            mvc.perform(get(PLAYER_PATH + "/check").session(session)).andExpect(status().isOk());
            mvc.perform(post("/api/admin/check").session(session).header("X-CSRF-TOKEN", adminToken))
                    .andExpect(status().isOk());
            mvc.perform(post(PLAYER_PATH + "/logout").session(session).header("X-CSRF-TOKEN", anonymousPlayerToken))
                    .andExpect(status().isForbidden());
            mvc.perform(post(PLAYER_PATH + "/logout").session(session).header("X-CSRF-TOKEN", playerToken))
                    .andExpect(status().isNoContent());
            mvc.perform(get(PLAYER_PATH + "/check").session(session)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/admin/check").session(session)).andExpect(status().isOk());

            String newToken = body(mvc.perform(get(PLAYER_PATH + "/session").session(session)).andReturn())
                    .path("csrfToken").asString();
            mvc.perform(login(PLAYER_PATH, TEST_EMAIL, session, newToken)).andExpect(status().isNoContent());
            mvc.perform(post("/api/admin/logout").session(session).header("X-CSRF-TOKEN", adminToken))
                    .andExpect(status().isNoContent());
            mvc.perform(get("/api/admin/check").session(session)).andExpect(status().isUnauthorized());
            mvc.perform(get(PLAYER_PATH + "/check").session(session)).andExpect(status().isOk());
        }
    }

    private static MockHttpServletRequestBuilder login(String path, String username,
            MockHttpSession session, String token) {
        return post(path + "/login").session(session).header("X-CSRF-TOKEN", token)
                .with(request -> {
                    request.setRequestedSessionId(session.getId());
                    request.setRequestedSessionIdValid(true);
                    return request;
                })
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", username).param("password", TEST_PASSWORD);
    }

    private static AnnotationConfigWebApplicationContext webContext(String hash) {
        return webContext(hash, false);
    }

    private static AnnotationConfigWebApplicationContext webContext(String hash, boolean playerEnabled) {
        var context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
                "admin-test", Map.of("lmuml.admin.password-hash", hash, "lmuml.admin.test-mvc.enabled", true,
                        "lmuml.player.enabled", playerEnabled)));
        context.register(MvcConfiguration.class, AdminSecurityConfiguration.class, AdminSessionController.class,
                PlayerSecurityConfiguration.class, PlayerSessionController.class);
        context.refresh();
        return context;
    }

    private static MockMvc mvc(AnnotationConfigWebApplicationContext context) {
        return MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class))
                .build();
    }

    private static JsonNode body(MvcResult result) {
        return JSON.readTree(result.getResponse().getContentAsByteArray());
    }

    @TestConfiguration(proxyBeanMethods = false)
    @ConditionalOnProperty("lmuml.admin.test-mvc.enabled")
    @EnableWebMvc
    @RestController
    static class MvcConfiguration {
        @Bean
        PlayerUserDetailsService playerUserDetailsService() {
            var players = mock(PlayerUserDetailsService.class);
            when(players.loadUserByUsername(any())).thenAnswer(invocation -> {
                String username = invocation.getArgument(0);
                if (!TEST_EMAIL.equals(username)) {
                    throw new UsernameNotFoundException("Unknown test player");
                }
                return new PlayerPrincipal(TEST_PLAYER_ID, TEST_EMAIL, "Kibic", TEST_HASH, 0L);
            });
            when(players.isCurrentSession(any(PlayerPrincipal.class))).thenReturn(true);
            return players;
        }

        @GetMapping("/api/probe")
        String publicRead() { return "ready"; }

        @GetMapping("/api/admin/check")
        String adminRead() { return "admin"; }

        @PostMapping("/api/admin/check")
        String adminWrite() { return "updated"; }

        @GetMapping(PLAYER_PATH + "/check")
        String playerRead() { return "player"; }

        @PostMapping(PLAYER_PATH + "/register")
        @ResponseStatus(CREATED)
        void registerPlayer() {}
    }
}
