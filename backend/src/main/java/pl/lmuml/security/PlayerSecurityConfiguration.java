package pl.lmuml.security;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import pl.lmuml.player.PlayerUserDetailsService;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PlayerSecurityConfiguration {

    static final String PLAYER_PATH = "/api/v1/player";

    @Bean
    SecurityFilterChain playerSecurity(HttpSecurity http,
            @Value("${lmuml.player.enabled:false}") boolean enabled,
            ObjectProvider<PlayerUserDetailsService> users) throws Exception {
        http.securityMatcher(PLAYER_PATH, PLAYER_PATH + "/**")
                .requestCache(AbstractHttpConfigurer::disable);

        if (!enabled) {
            return http.csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(requests -> requests.anyRequest().denyAll())
                    .exceptionHandling(exceptions -> exceptions
                            .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.NOT_FOUND))
                            .accessDeniedHandler((request, response, failure) ->
                                    response.setStatus(HttpServletResponse.SC_NOT_FOUND)))
                    .build();
        }

        var players = users.getObject();
        var provider = new DaoAuthenticationProvider(players);
        provider.setPasswordEncoder(Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8());

        // Login rotates the browser session ID while the two chains retain separate identities and CSRF tokens.
        var sessionContext = new HttpSessionSecurityContextRepository();
        sessionContext.setSpringSecurityContextKey("LMUML_PLAYER_SECURITY_CONTEXT");
        var securityContext = new DelegatingSecurityContextRepository(
                new RequestAttributeSecurityContextRepository(), sessionContext);
        var csrfTokens = new HttpSessionCsrfTokenRepository();
        csrfTokens.setSessionAttributeName("LMUML_PLAYER_CSRF_TOKEN");
        var staleSessionLogout = new SecurityContextLogoutHandler();
        staleSessionLogout.setInvalidateHttpSession(false);
        staleSessionLogout.setSecurityContextRepository(securityContext);

        return http.authenticationManager(new ProviderManager(provider))
                .securityContext(context -> context.securityContextRepository(securityContext))
                .addFilterAfter(new PlayerSessionVersionFilter(players, staleSessionLogout,
                        new CsrfLogoutHandler(csrfTokens)), CsrfFilter.class)
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.GET, PLAYER_PATH + "/session").permitAll()
                        .requestMatchers(HttpMethod.POST, PLAYER_PATH + "/login", PLAYER_PATH + "/register",
                                PLAYER_PATH + "/password-reset/request", PLAYER_PATH + "/password-reset/confirm").permitAll()
                        .anyRequest().hasRole("PLAYER"))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokens))
                .sessionManagement(session -> session.sessionFixation(fixation -> fixation.changeSessionId()))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .formLogin(login -> login.loginPage("/")
                        .loginProcessingUrl(PLAYER_PATH + "/login")
                        .successHandler((request, response, authentication) ->
                                response.setStatus(HttpServletResponse.SC_NO_CONTENT))
                        .failureHandler((request, response, failure) ->
                                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED)))
                .logout(logout -> logout.logoutUrl(PLAYER_PATH + "/logout")
                        .invalidateHttpSession(false)
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .build();
    }
}
