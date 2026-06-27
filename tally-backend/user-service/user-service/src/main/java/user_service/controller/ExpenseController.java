package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Expense;
import user_service.service.ExpenseService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/expenses")
@CrossOrigin(origins = "*")
public class ExpenseController {

    @Autowired
    private ExpenseService expenseService;

    @PostMapping
    public ResponseEntity<?> createExpense(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String amountStr = request.get("amount");
            String category = request.get("category");
            String dateStr = request.get("date");

            if (userIdStr == null || amountStr == null || category == null || dateStr == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId, amount, category and date are required"));
            }

            if (category.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Category cannot be empty"));
            }

            Long userId = Long.parseLong(userIdStr);
            BigDecimal amount = new BigDecimal(amountStr);

            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must be greater than zero"));
            }

            String description = request.get("description");
            String paymentMethod = request.getOrDefault("paymentMethod", "CASH");
            LocalDate date = LocalDate.parse(dateStr);

            Expense expense = expenseService.createExpense(userId, amount, category, description, date, paymentMethod);
            return ResponseEntity.ok(expense);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserExpenses(@PathVariable Long userId,
                                             @RequestParam(required = false) String category) {
        try {
            List<Expense> expenses;
            if (category != null && !category.isEmpty()) {
                expenses = expenseService.getUserExpensesByCategory(userId, category);
            } else {
                expenses = expenseService.getUserExpenses(userId);
            }
            return ResponseEntity.ok(expenses);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{expenseId}")
    public ResponseEntity<?> deleteExpense(@PathVariable Long expenseId) {
        try {
            expenseService.deleteExpense(expenseId);
            return ResponseEntity.ok(Map.of("message", "Expense deleted successfully"));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/user/{userId}/report")
    public ResponseEntity<?> getMonthlyReport(@PathVariable Long userId,
                                              @RequestParam(required = false) Integer month,
                                              @RequestParam(required = false) Integer year) {
        try {
            Map<String, Object> report = expenseService.getMonthlyReport(userId, month, year);
            return ResponseEntity.ok(report);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/user/{userId}/history")
    public ResponseEntity<?> getCombinedHistory(@PathVariable Long userId) {
        try {
            return ResponseEntity.ok(expenseService.getCombinedHistory(userId));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }
}