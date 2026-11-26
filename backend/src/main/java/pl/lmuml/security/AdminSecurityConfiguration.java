package pl.lmuml.security;

import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class AdminSecurityConfiguration {

    private static final String ADMIN_PATH = "/api/admin";
    private static final Pattern PASSWORD_HASH = Pattern.compile("[0-9a-f]{96}");

    @Bean
    InMemoryUserDetailsManager adminUsers(@Value("${lmuml.admin.password-hash:}") String passwordHash) {
        var users = new InMemoryUserDetailsManager();
        if (PASSWORD_HASH.matcher(passwordHash).matches()) {
            users.createUser(User.withUsername("admin").password(passwordHash).roles("ADMIN").build());
        }
        return users;
    }

    @Bean
    SecurityFilterChain adminSecurity(HttpSecurity http, InMemoryUserDetailsManager adminUsers) throws Exception {
        http.securityMatcher(ADMIN_PATH, ADMIN_PATH + "/**")
                .requestCache(AbstractHttpConfigurer::disable);

        if (!adminUsers.userExists("admin")) {
            return http.csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(requests -> requests.anyRequest().denyAll())
                    .exceptionHandling(exceptions -> exceptions
                            .authenticationEntryPoint((request, response, failure) ->
                                    response.setStatus(HttpServletResponse.SC_NOT_FOUND))
                            .accessDeniedHandler((request, response, failure) ->
                                    response.setStatus(HttpServletResponse.SC_NOT_FOUND)))
                    .build();
        }

        var provider = new DaoAuthenticationProvider(adminUsers);
        provider.setPasswordEncoder(Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8());

        return http.authenticationManager(new ProviderManager(provider))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.GET, ADMIN_PATH + "/session").permitAll()
                        .requestMatchers(HttpMethod.POST, ADMIN_PATH + "/login").permitAll()
                        .anyRequest().hasRole("ADMIN"))
                .csrf(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionFixation(fixation -> fixation.changeSessionId()))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint((request, response, failure) ->
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED)))
                .formLogin(login -> login.loginPage("/admin")
                        .loginProcessingUrl(ADMIN_PATH + "/login")
                        .successHandler((request, response, authentication) ->
                                response.setStatus(HttpServletResponse.SC_NO_CONTENT))
                        .failureHandler((request, response, failure) ->
                                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED)))
                .logout(logout -> logout.logoutUrl(ADMIN_PATH + "/logout")
                        .invalidateHttpSession(false)
                        .logoutSuccessHandler((request, response, authentication) ->
                                response.setStatus(HttpServletResponse.SC_NO_CONTENT)))
                .build();
    }
}
