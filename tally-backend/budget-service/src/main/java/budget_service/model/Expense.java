package budget_service.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "expenses")
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String category;

    private String description;

    @Column(nullable = false)
    private LocalDate date;

    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // One of: CASH, MOMO (MTN Mobile Money), SETTLEMENT, PAYSTACK (card via Paystack)
    @Column(name = "payment_method", nullable = true)
    private String paymentMethod = "CASH";

    // COMPLETED (default), PENDING (MoMo in flight), FAILED (MoMo rejected)
    @Column(name = "status")
    private String status = "COMPLETED";

    // MoMo transfer referenceId — links this expense to a disbursement so its
    // status can be updated when the transfer resolves. Unique per transfer.
    @Column(name = "momo_reference_id", unique = true)
    private String momoReferenceId;

    // Optional free-text notes (separate from description, à la Splitwise)
    @Column(columnDefinition = "TEXT")
    private String notes;

    // Optional receipt photo, stored as base64 data URI
    @Column(name = "receipt_photo", columnDefinition = "TEXT")
    private String receiptPhoto;

    // Recurring expense support
    @Column(name = "is_recurring")
    private Boolean isRecurring = false;

    // DAILY, WEEKLY or MONTHLY — null when not recurring
    @Column(name = "recurrence_type")
    private String recurrenceType;

    @Column(name = "next_due_date")
    private LocalDate nextDueDate;
}