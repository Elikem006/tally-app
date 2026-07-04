package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Budget;
import user_service.service.BudgetService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/budgets")
@CrossOrigin(origins = "*")
public class BudgetController {

    @Autowired
    private BudgetService budgetService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    @PostMapping
    public ResponseEntity<?> setBudget(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String category = request.get("category");
            String monthlyLimitStr = request.get("monthlyLimit");

            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "userId is required", "success", false));
            }
            if (category == null || category.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "category is required", "success", false));
            }
            if (monthlyLimitStr == null || monthlyLimitStr.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "monthlyLimit is required", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);
            BigDecimal monthlyLimit = new BigDecimal(monthlyLimitStr);

            if (monthlyLimit.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "monthlyLimit must be greater than zero", "success", false));
            }

            Budget budget = budgetService.setBudget(userId, category, monthlyLimit);
            return ResponseEntity.status(HttpStatus.CREATED).body(budget);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserBudgets(@PathVariable Long userId) {
        try {
            List<Budget> budgets = budgetService.getUserBudgets(userId);
            return ResponseEntity.ok(budgets);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/user/{userId}/summary")
    public ResponseEntity<?> getBudgetSummary(@PathVariable Long userId) {
        try {
            // Return the summary map directly — its keys are category names (Food, Transport, etc.)
            // so we must NOT add extra fields like "success" here, as the frontend
            // iterates every key and would try to render "success" as a budget category.
            Map<String, Object> summary = budgetService.getBudgetSummary(userId);
            return ResponseEntity.ok(summary);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @DeleteMapping("/user/{userId}/{category}")
    public ResponseEntity<?> deleteBudget(
            @PathVariable Long userId,
            @PathVariable String category) {
        try {
            budgetService.deleteBudget(userId, category);
            return ResponseEntity.ok(Map.of("message", "Budget deleted", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
