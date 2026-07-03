package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Reminder;
import user_service.service.ReminderService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reminders")
@CrossOrigin(origins = "*")
public class ReminderController {

    @Autowired
    private ReminderService reminderService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    // POST /api/reminders
    // Body: { userId, title, amount?, dueDate?, isRecurring?, recurrenceType? }
    @PostMapping
    public ResponseEntity<?> createReminder(@RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            String title = request.get("title");

            if (userIdStr == null || title == null || title.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId and title are required", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);

            String amountStr = request.get("amount");
            BigDecimal amount = (amountStr != null && !amountStr.isBlank())
                    ? new BigDecimal(amountStr) : null;
            if (amount != null && amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must be greater than zero", "success", false));
            }

            String dueDateStr = request.get("dueDate");
            LocalDate dueDate = (dueDateStr != null && !dueDateStr.isBlank())
                    ? LocalDate.parse(dueDateStr) : null;

            String isRecurringStr = request.get("isRecurring");
            Boolean isRecurring = (isRecurringStr != null)
                    ? Boolean.parseBoolean(isRecurringStr) : false;

            String recurrenceType = request.get("recurrenceType");

            Reminder reminder = reminderService.createReminder(
                    userId, title, amount, dueDate, isRecurring, recurrenceType);
            return ResponseEntity.status(HttpStatus.CREATED).body(reminder);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // GET /api/reminders/user/{userId}
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserReminders(@PathVariable Long userId) {
        try {
            List<Reminder> reminders = reminderService.getUserReminders(userId);
            return ResponseEntity.ok(reminders);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // GET /api/reminders/user/{userId}/upcoming — due within 7 days, not paid
    @GetMapping("/user/{userId}/upcoming")
    public ResponseEntity<?> getUpcomingReminders(@PathVariable Long userId) {
        try {
            List<Reminder> reminders = reminderService.getUpcomingReminders(userId);
            return ResponseEntity.ok(reminders);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // PUT /api/reminders/{reminderId}/paid
    @PutMapping("/{reminderId}/paid")
    public ResponseEntity<?> markPaid(@PathVariable Long reminderId) {
        try {
            Reminder reminder = reminderService.markPaid(reminderId);
            return ResponseEntity.ok(reminder);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // DELETE /api/reminders/{reminderId}
    @DeleteMapping("/{reminderId}")
    public ResponseEntity<?> deleteReminder(@PathVariable Long reminderId) {
        try {
            reminderService.deleteReminder(reminderId);
            return ResponseEntity.ok(Map.of("message", "Reminder deleted", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
