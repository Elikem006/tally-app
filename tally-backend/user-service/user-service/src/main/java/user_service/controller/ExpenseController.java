package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Expense;
import user_service.service.ExpenseService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/expenses")
@CrossOrigin(origins = "*")
public class ExpenseController {

    @Autowired
    private ExpenseService expenseService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    @PostMapping
    public ResponseEntity<?> createExpense(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String amountStr = request.get("amount");
            String category = request.get("category");
            String dateStr = request.get("date");

            if (userIdStr == null || amountStr == null || category == null || dateStr == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId, amount, category and date are required", "success", false));
            }

            if (category.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Category cannot be empty", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);
            BigDecimal amount = new BigDecimal(amountStr);

            if (amount.compareTo(BigDecimal.ZERO) == 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must not be zero", "success", false));
            }

            String description = request.get("description");
            String paymentMethod = request.getOrDefault("paymentMethod", "CASH");
            LocalDate date = LocalDate.parse(dateStr);

            Expense expense = expenseService.createExpense(userId, amount, category, description, date, paymentMethod);
            return ResponseEntity.status(HttpStatus.CREATED).body(expense);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
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
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @DeleteMapping("/{expenseId}")
    public ResponseEntity<?> deleteExpense(@PathVariable Long expenseId) {
        try {
            expenseService.deleteExpense(expenseId);
            return ResponseEntity.ok(Map.of("message", "Expense deleted successfully", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/user/{userId}/report")
    public ResponseEntity<?> getMonthlyReport(@PathVariable Long userId,
                                              @RequestParam(required = false) Integer month,
                                              @RequestParam(required = false) Integer year) {
        try {
            Map<String, Object> report = expenseService.getMonthlyReport(userId, month, year);
            // Copy to new map so we don't mutate the service-returned object
            Map<String, Object> response = new HashMap<>(report);
            response.put("success", true);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/user/{userId}/history")
    public ResponseEntity<?> getCombinedHistory(@PathVariable Long userId) {
        try {
            return ResponseEntity.ok(expenseService.getCombinedHistory(userId));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/expenses/user/{userId}/export?format=csv|pdf
     * csv → text/csv attachment; pdf → cleanly styled HTML table
     * (the app converts it to a PDF on-device with expo-print).
     */
    @GetMapping("/user/{userId}/export")
    public ResponseEntity<?> exportExpenses(@PathVariable Long userId,
                                            @RequestParam(defaultValue = "csv") String format) {
        try {
            if ("csv".equalsIgnoreCase(format)) {
                String csv = expenseService.buildCsvExport(userId);
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=tally-expenses.csv")
                        .contentType(MediaType.parseMediaType("text/csv"))
                        .body(csv);
            }
            if ("pdf".equalsIgnoreCase(format)) {
                String html = expenseService.buildHtmlExport(userId);
                return ResponseEntity.ok()
                        .contentType(MediaType.TEXT_HTML)
                        .body(html);
            }
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "format must be csv or pdf", "success", false));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /** GET /api/expenses/user/{userId}/recurring — all recurring expenses, soonest due first. */
    @GetMapping("/user/{userId}/recurring")
    public ResponseEntity<?> getRecurringExpenses(@PathVariable Long userId) {
        try {
            return ResponseEntity.ok(expenseService.getRecurringExpenses(userId));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * PUT /api/expenses/{expenseId}/recurring
     * Body: { "isRecurring": "true"|"false", "recurrenceType": "DAILY"|"WEEKLY"|"MONTHLY" }
     */
    @PutMapping("/{expenseId}/recurring")
    public ResponseEntity<?> updateRecurring(@PathVariable Long expenseId,
                                             @RequestBody Map<String, String> request) {
        try {
            boolean isRecurring = Boolean.parseBoolean(request.get("isRecurring"));
            String recurrenceType = request.get("recurrenceType");
            Expense updated = expenseService.updateRecurring(expenseId, isRecurring, recurrenceType);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
