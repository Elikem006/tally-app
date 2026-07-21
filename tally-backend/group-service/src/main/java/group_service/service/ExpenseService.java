package group_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import group_service.model.Expense;
import group_service.repository.ExpenseRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

/**
 * Trimmed copy of expense-service's ExpenseService containing ONLY the
 * createExpense logic (copied verbatim). GroupService.settleUp uses it to
 * record settlement income rows in the shared `expenses` table.
 *
 * KNOWN CROSS-SERVICE DATA COUPLING (microservices migration): group-service
 * writes to the `expenses` table, which is owned by expense-service. This is
 * a deliberate shared-database shortcut — replacing it with an HTTP/event
 * call to expense-service is out of scope for the structural migration.
 * Any change to expense-service's createExpense validation must be mirrored
 * here.
 */
@Service
public class ExpenseService {

    @Autowired
    private ExpenseRepository expenseRepository;

    // MOMO_TRANSFER is a distinct method from MOMO: it marks vendor disbursements
    // sent via /api/momo/transfer. The mobile History screen renders a separate
    // badge for it, so it must remain its own value rather than collapsing to MOMO.
    private static final Set<String> ALLOWED_PAYMENT_METHODS =
            Set.of("CASH", "MOMO", "MOMO_TRANSFER", "SETTLEMENT", "PAYSTACK");

    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date, String paymentMethod) {
        return createExpense(userId, amount, category, description, date, paymentMethod,
                "COMPLETED", null);
    }

    /**
     * Full expense creation with validation:
     * - amount must be non-zero, normalized to 2 decimal places
     * - paymentMethod restricted to CASH / MOMO / SETTLEMENT / PAYSTACK
     * - blank descriptions stored as null
     * - idempotency: an identical expense (userId+amount+category+date) created
     *   within the last 10 seconds is returned instead of duplicated (double-tap guard)
     * - status: COMPLETED (default), PENDING or FAILED (MoMo in-flight transfers)
     */
    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date, String paymentMethod,
                                 String status, String momoReferenceId) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) {
            throw new RuntimeException("Amount must not be zero");
        }
        // Sanity cap — no GHS 1,000,000 expenses
        if (amount.abs().compareTo(new BigDecimal("1000000")) > 0) {
            throw new RuntimeException("Amount looks too large — maximum is GHS 1,000,000");
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);

        // Sanitize description: strip HTML tags (XSS), trim, treat blank as null
        if (description != null) {
            description = description.replaceAll("<[^>]*>", "").trim();
            if (description.isEmpty()) description = null;
        }

        String method = (paymentMethod != null && !paymentMethod.isBlank())
                ? paymentMethod.trim().toUpperCase() : "CASH";
        if (!ALLOWED_PAYMENT_METHODS.contains(method)) {
            throw new RuntimeException("paymentMethod must be one of: CASH, MOMO, SETTLEMENT, PAYSTACK");
        }

        // Idempotency guard: same userId+amount+category+date within 10 seconds
        // is treated as a double-tap — return the existing record.
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(10);
        for (Expense recent : expenseRepository.findByUserIdOrderByDateDesc(userId)) {
            if (recent.getCreatedAt() != null && recent.getCreatedAt().isAfter(cutoff)
                    && recent.getAmount() != null && recent.getAmount().compareTo(amount) == 0
                    && Objects.equals(recent.getCategory(), category)
                    && Objects.equals(recent.getDate(), date)) {
                return recent;
            }
        }

        Expense expense = new Expense();
        expense.setUserId(userId);
        expense.setAmount(amount);
        expense.setCategory(category);
        expense.setDescription(description);
        expense.setDate(date);
        expense.setPaymentMethod(method);
        expense.setStatus(status != null && !status.isBlank() ? status : "COMPLETED");
        expense.setMomoReferenceId(momoReferenceId);
        return expenseRepository.save(expense);
    }
}
