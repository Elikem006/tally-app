package api_gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Single source of truth for request routing. The mobile app only ever talks
 * to this gateway (port 8082 locally — the same port the monolith used, so
 * the mobile BASE_URL did not have to change).
 *
 * Target URLs come from environment variables so Railway can point each route
 * at the deployed service's internal/public URL:
 *   AUTH_SERVICE_URL, EXPENSE_SERVICE_URL, BUDGET_SERVICE_URL, GROUP_SERVICE_URL
 * Local defaults match the ports each service binds in local dev (8090-8093).
 *
 * NOTE: /api/categories, /api/reminders and /api/momo are owned by
 * expense-service (they are expense-adjacent domains folded in during the
 * microservices migration).
 */
@Configuration
public class GatewayRoutesConfig {

    @Value("${services.auth-url}")
    private String authServiceUrl;

    @Value("${services.expense-url}")
    private String expenseServiceUrl;

    @Value("${services.budget-url}")
    private String budgetServiceUrl;

    @Value("${services.group-url}")
    private String groupServiceUrl;

    @Bean
    public RouteLocator tallyRoutes(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("auth-service", r -> r
                        .path("/api/auth/**")
                        .uri(authServiceUrl))
                .route("expense-service", r -> r
                        .path("/api/expenses/**", "/api/categories/**",
                              "/api/reminders/**", "/api/momo/**")
                        .uri(expenseServiceUrl))
                .route("budget-service", r -> r
                        .path("/api/budgets/**")
                        .uri(budgetServiceUrl))
                .route("group-service", r -> r
                        .path("/api/groups/**")
                        .uri(groupServiceUrl))
                .build();
    }
}
