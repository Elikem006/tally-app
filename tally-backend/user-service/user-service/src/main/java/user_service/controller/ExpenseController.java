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
            Long userId = Long.parseLong(request.get("userId"));
            BigDecimal amount = new BigDecimal(request.get("amount"));
            String category = request.get("category");
            String description = request.get("description");
            LocalDate date = LocalDate.parse(request.get("date"));

            Expense expense = expenseService.createExpense(userId, amount, category, description, date);
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
}