package user_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import user_service.model.Reminder;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface ReminderRepository extends JpaRepository<Reminder, Long> {
    List<Reminder> findByUserIdOrderByDueDateAsc(Long userId);

    // All unpaid reminders for a user
    List<Reminder> findByUserIdAndIsPaidFalse(Long userId);

    // Reminders due before a given date (overdue checks)
    List<Reminder> findByUserIdAndDueDateBefore(Long userId, LocalDate date);

    // Upcoming: due within a date range AND not yet paid
    List<Reminder> findByUserIdAndIsPaidFalseAndDueDateBetweenOrderByDueDateAsc(
            Long userId, LocalDate start, LocalDate end);
}
