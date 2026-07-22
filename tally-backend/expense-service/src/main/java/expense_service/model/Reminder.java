package expense_service.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "reminders")
public class Reminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String title;

    @Column
    private BigDecimal amount;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "is_recurring")
    private Boolean isRecurring = false;

    // DAILY, WEEKLY, MONTHLY — null when isRecurring is false
    @Column(name = "recurrence_type")
    private String recurrenceType;

    @Column(name = "is_paid")
    private Boolean isPaid = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /**
     * Computed, not persisted: true when the reminder is unpaid and past due.
     * Serialized by Jackson as "isOverdue" in every reminder response.
     */
    @Transient
    public boolean getIsOverdue() {
        return !Boolean.TRUE.equals(isPaid)
                && dueDate != null
                && dueDate.isBefore(LocalDate.now());
    }
}
