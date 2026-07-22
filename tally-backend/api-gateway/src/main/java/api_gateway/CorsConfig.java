package api_gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Centralized CORS for the whole Tally platform — mirrors the semantics the
 * monolith's SecurityConfig used, but now lives at the single entry point.
 * The backend services sit behind this gateway and are never called directly
 * by browsers, so this is the only CORS policy that matters externally.
 *
 * ALLOWED_ORIGINS:
 *   - unset / "*"  → all origins allowed (local dev), credentials disabled
 *   - csv of URLs  → only those origins, credentials enabled
 *
 * No per-controller @CrossOrigin exists anywhere — do not reintroduce it.
 */
@Configuration
public class CorsConfig {

    @Value("${app.cors.allowed-origins:*}")
    private String allowedOriginsRaw;

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.asList(allowedOriginsRaw.split(","));
        if (origins.size() == 1 && "*".equals(origins.get(0).trim())) {
            config.addAllowedOriginPattern("*");
        } else {
            for (String origin : origins) {
                config.addAllowedOrigin(origin.trim());
            }
        }

        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(!origins.contains("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsWebFilter(source);
    }
}
