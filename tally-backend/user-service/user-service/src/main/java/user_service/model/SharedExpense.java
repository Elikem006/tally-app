package user_service.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "shared_expenses")
public class SharedExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "paid_by", nullable = false)
    private Long paidBy;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String description;

    // EQUAL (default) or CUSTOM
    @Column(name = "split_type", nullable = false)
    private String splitType = "EQUAL";

    /**
     * JSON map of userId → percentage, only set when splitType is CUSTOM.
     * Example: {"1": 60, "2": 40} — user 1 pays 60%, user 2 pays 40%.
     */
    @Column(name = "split_ratios", columnDefinition = "TEXT")
    private String splitRatios;

    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}