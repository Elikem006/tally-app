package group_service.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Records that ONE participant has paid their share of a SharedExpense.
 * A row here means "shared_expense_id's debt for user_id is resolved" —
 * separate from SharedExpense.settled, which only flips true once every
 * debtor on that expense has a row here (see GroupService.settleUp).
 */
@Data
@Entity
@Table(name = "shared_expense_settlements",
       uniqueConstraints = @UniqueConstraint(columnNames = {"shared_expense_id", "user_id"}))
public class SharedExpenseSettlement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shared_expense_id", nullable = false)
    private Long sharedExpenseId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "settled_at", nullable = false)
    private LocalDateTime settledAt = LocalDateTime.now();
}
