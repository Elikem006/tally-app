package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
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

    @PostMapping
    public ResponseEntity<?> setBudget(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String category = request.get("category");
            String monthlyLimitStr = request.get("monthlyLimit");

            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "userId is required"));
            }
            if (category == null || category.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "category is required"));
            }
            if (monthlyLimitStr == null || monthlyLimitStr.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "monthlyLimit is required"));
            }

            Long userId = Long.parseLong(userIdStr);
            BigDecimal monthlyLimit = new BigDecimal(monthlyLimitStr);

            if (monthlyLimit.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "monthlyLimit must be greater than zero"));
            }

            Budget budget = budgetService.setBudget(userId, category, monthlyLimit);
            return ResponseEntity.ok(budget);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

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