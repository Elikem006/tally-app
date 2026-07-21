package expense_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import expense_service.model.Reminder;
import expense_service.repository.ReminderRepository;
import expense_service.repository.UserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
public class ReminderService {

    @Autowired
    private ReminderRepository reminderRepository;

    @Autowired
    private UserRepository userRepository;

    public Reminder createReminder(Long userId, String title, BigDecimal amount,
                                   LocalDate dueDate, Boolean isRecurring,
                                   String recurrenceType) {
        if (!userRepository.existsById(userId)) {
            throw new RuntimeException("User not found: " + userId);
        }
        Reminder reminder = new Reminder();
        reminder.setUserId(userId);
        reminder.setTitle(title);
        reminder.setAmount(amount);
        reminder.setDueDate(dueDate);
        reminder.setIsRecurring(isRecurring != null ? isRecurring : false);
        reminder.setRecurrenceType(recurrenceType);
        reminder.setIsPaid(false);
        return reminderRepository.save(reminder);
    }

    public List<Reminder> getUserReminders(Long userId) {
        return reminderRepository.findByUserIdOrderByDueDateAsc(userId);
    }

    // Unpaid reminders due within the next 7 days — INCLUDING overdue ones
    // (an unpaid bill from last week is more urgent, not less).
    public List<Reminder> getUpcomingReminders(Long userId) {
        LocalDate cutoff = LocalDate.now().plusDays(7);
        return reminderRepository.findByUserIdAndIsPaidFalse(userId).stream()
                .filter(r -> r.getDueDate() != null && !r.getDueDate().isAfter(cutoff))
                .sorted((a, b) -> a.getDueDate().compareTo(b.getDueDate()))
                .toList();
    }

    public Reminder markPaid(Long reminderId) {
        Reminder reminder = reminderRepository.findById(reminderId)
                .orElseThrow(() -> new RuntimeException("Reminder not found: " + reminderId));
        reminder.setIsPaid(true);
        Reminder saved = reminderRepository.save(reminder);

        // Recurring reminders roll over: paying this occurrence automatically
        // creates the next one with the due date advanced by the period.
        if (Boolean.TRUE.equals(reminder.getIsRecurring())
                && reminder.getRecurrenceType() != null
                && reminder.getDueDate() != null) {
            LocalDate nextDue = switch (reminder.getRecurrenceType().toUpperCase()) {
                case "DAILY"   -> reminder.getDueDate().plusDays(1);
                case "WEEKLY"  -> reminder.getDueDate().plusWeeks(1);
                case "MONTHLY" -> reminder.getDueDate().plusMonths(1);
                default -> null;
            };
            if (nextDue != null) {
                Reminder next = new Reminder();
                next.setUserId(reminder.getUserId());
                next.setTitle(reminder.getTitle());
                next.setAmount(reminder.getAmount());
                next.setDueDate(nextDue);
                next.setIsRecurring(true);
                next.setRecurrenceType(reminder.getRecurrenceType());
                next.setIsPaid(false);
                reminderRepository.save(next);
            }
        }
        return saved;
    }

    public void deleteReminder(Long reminderId) {
        if (!reminderRepository.existsById(reminderId)) {
            throw new RuntimeException("Reminder not found: " + reminderId);
        }
        reminderRepository.deleteById(reminderId);
    }
}
