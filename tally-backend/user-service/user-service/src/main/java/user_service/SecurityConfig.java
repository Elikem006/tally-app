package user_service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * SECURITY WARNING: controllers use @CrossOrigin(origins = "*") — acceptable
 * for the sandbox/dev phase only.
 * TODO before production: restrict CORS to the deployed app origin(s) via a
 * central CorsConfigurationSource bean and remove the per-controller wildcards.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // CORS preflight never carries credentials
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Public endpoints: registration, login, health, MoMo callback, password reset
                        .requestMatchers("/api/auth/register", "/api/auth/login",
                                "/api/auth/health", "/api/auth/forgot-password",
                                "/api/auth/reset-password", "/api/momo/callback").permitAll()
                        // Everything else requires a valid JWT (see JwtAuthFilter)
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}