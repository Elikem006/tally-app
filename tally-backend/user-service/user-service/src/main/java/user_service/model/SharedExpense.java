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

    /**
     * Snapshot of the member userIds present when this expense was created,
     * stored as CSV (e.g. "1,2,3"). Members who join the group later are NOT
     * part of this expense's split. Null for legacy rows — treated as
     * "all current members" for backward compatibility.
     */
    @Column(name = "participant_ids", columnDefinition = "TEXT")
    private String participantIds;

    /**
     * True once this expense has been settled. Settled expenses stay in the
     * group history but no longer count toward balances.
     */
    @Column(name = "settled")
    private Boolean settled = false;

    /** Optimistic locking — prevents concurrent settle-up race conditions. */
    @Version
    @Column(name = "version")
    private Long version;

    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}