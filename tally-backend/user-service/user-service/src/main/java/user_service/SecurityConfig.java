package user_service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Central CORS is handled here via CorsConfigurationSource.
 * The ALLOWED_ORIGINS env var controls which origins are permitted:
 *   - Local dev / default: * (all origins)
 *   - Railway production: set ALLOWED_ORIGINS=https://tally-app.up.railway.app
 *     (replace with your actual Railway public URL)
 *
 * No per-controller @CrossOrigin annotations are present — this bean is the
 * single source of truth for CORS across all endpoints.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    /**
     * Comma-separated list of allowed origins.
     * Defaults to * so local dev works with no extra config.
     * Set ALLOWED_ORIGINS in Railway to lock this down in production.
     */
    @Value("${app.cors.allowed-origins:*}")
    private String allowedOriginsRaw;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    /**
     * Explicit UserDetailsService bean that always throws — suppresses Spring Boot's
     * auto-configured in-memory UserDetailsService and its "Using generated security
     * password" warning. Authentication in this app is handled entirely by JwtAuthFilter;
     * Spring's form-login / HTTP Basic mechanisms are not used and have no active endpoint.
     */
    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException(
                "Direct UserDetailsService lookup is not supported — use JWT authentication.");
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.asList(allowedOriginsRaw.split(","));
        if (origins.size() == 1 && "*".equals(origins.get(0).trim())) {
            // Wildcard — allow all origins (local dev / sandbox)
            config.addAllowedOriginPattern("*");
        } else {
            // Explicit list — only the named Railway (or other) URLs
            for (String origin : origins) {
                config.addAllowedOrigin(origin.trim());
            }
        }

        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(!origins.contains("*")); // credentials only when not wildcard

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
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