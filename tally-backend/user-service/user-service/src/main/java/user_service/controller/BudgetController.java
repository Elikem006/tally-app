package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Budget;
import user_service.service.BudgetService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Handles all budget-related API requests at /api/budgets.
 * Delegates logic to BudgetService.
 */
@RestController
@RequestMapping("/api/budgets")
@CrossOrigin(origins = "*")
public class BudgetController {

    @Autowired
    private BudgetService budgetService;

    /**
     * POST /api/budgets
     * Creates or updates a monthly budget for a specific category.
     * Required fields: userId, category, monthlyLimit
     */
    @PostMapping
    public ResponseEntity<?> setBudget(@RequestBody Map<String, String> request) {
        try {
            Long userId = Long.parseLong(request.get("userId"));
            String category = request.get("category");
            BigDecimal monthlyLimit = new BigDecimal(request.get("monthlyLimit"));

            if (category == null || monthlyLimit == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Category and monthlyLimit are required"));
            }

            Budget budget = budgetService.setBudget(userId, category, monthlyLimit);
            return ResponseEntity.ok(budget);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * GET /api/budgets/user/{userId}
     * Returns all budgets belonging to the specified user.
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserBudgets(@PathVariable Long userId) {
        try {
            List<Budget> budgets = budgetService.getUserBudgets(userId);
            return ResponseEntity.ok(budgets);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * GET /api/budgets/user/{userId}/summary
     * Returns a spending summary showing amount spent vs limit per category.
     */
    @GetMapping("/user/{userId}/summary")
    public ResponseEntity<?> getBudgetSummary(@PathVariable Long userId) {
        try {
            Map<String, Object> summary = budgetService.getBudgetSummary(userId);
            return ResponseEntity.ok(summary);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * DELETE /api/budgets/user/{userId}/{category}
     * Deletes the budget for the specified user and category.
     */
    @DeleteMapping("/user/{userId}/{category}")
    public ResponseEntity<?> deleteBudget(
            @PathVariable Long userId,
            @PathVariable String category) {
        try {
            budgetService.deleteBudget(userId, category);
            return ResponseEntity.ok(Map.of("message", "Budget deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }
}