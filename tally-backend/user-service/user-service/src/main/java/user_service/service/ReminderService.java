package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Reminder;
import user_service.repository.ReminderRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
public class ReminderService {

    @Autowired
    private ReminderRepository reminderRepository;

    public Reminder createReminder(Long userId, String title, BigDecimal amount,
                                   LocalDate dueDate, Boolean isRecurring,
                                   String recurrenceType) {
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

    // Reminders due within the next 7 days that are not yet paid
    public List<Reminder> getUpcomingReminders(Long userId) {
        LocalDate today = LocalDate.now();
        LocalDate inSevenDays = today.plusDays(7);
        return reminderRepository
                .findByUserIdAndIsPaidFalseAndDueDateBetweenOrderByDueDateAsc(
                        userId, today, inSevenDays);
    }

    public Reminder markPaid(Long reminderId) {
        Reminder reminder = reminderRepository.findById(reminderId)
                .orElseThrow(() -> new RuntimeException("Reminder not found: " + reminderId));
        reminder.setIsPaid(true);
        return reminderRepository.save(reminder);
    }

    public void deleteReminder(Long reminderId) {
        reminderRepository.deleteById(reminderId);
    }
}
