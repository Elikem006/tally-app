package expense_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import expense_service.client.BearerForward;
import expense_service.client.BudgetClient;
import expense_service.client.DownstreamUnavailableException;
import expense_service.client.GroupDataClient;
import expense_service.model.Expense;
import expense_service.repository.ExpenseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.stream.Collectors;

/**
 * MICROSERVICES CORRECTION: this service now touches ONLY its own tables
 * (expenses, custom_categories, reminders). The monthly report and combined
 * history use API composition instead of the former read-only JPA mappings:
 *   - budgets                    -> budget-service GET /api/budgets/user/{id}
 *   - groups / shared expenses   -> group-service  GET /api/groups/user/{id}/shared-data
 * The two report calls run CONCURRENTLY (CompletableFuture) so the extra
 * network hops cost one round-trip, not two.
 */
@Service
public class ExpenseService {

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private BudgetClient budgetClient;

    @Autowired
    private GroupDataClient groupDataClient;

    // MOMO_TRANSFER is a distinct method from MOMO: it marks vendor disbursements
    // sent via /api/momo/transfer. The mobile History screen renders a separate
    // badge for it, so it must remain its own value rather than collapsing to MOMO.
    private static final Set<String> ALLOWED_PAYMENT_METHODS =
            Set.of("CASH", "MOMO", "MOMO_TRANSFER", "SETTLEMENT", "PAYSTACK");

    private static final ObjectMapper shareMapper = new ObjectMapper();

    // ── JSON DTO helpers (values arrive from other services as Maps) ─────────

    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private static BigDecimal asBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        return new BigDecimal(String.valueOf(v));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asList(Object v) {
        return v instanceof List ? (List<Map<String, Object>>) v : new ArrayList<>();
    }

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

    // Overload for backward compatibility
    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date) {
        return createExpense(userId, amount, category, description, date, "CASH");
    }

    /** Attach optional notes and/or a receipt photo to an expense. */
    public Expense updateExtras(Long expenseId, String notes, String receiptPhoto) {
        Expense e = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new RuntimeException("Expense not found: " + expenseId));
        if (notes != null) {
            String clean = notes.replaceAll("<[^>]*>", "").trim();
            e.setNotes(clean.isEmpty() ? null : clean);
        }
        if (receiptPhoto != null) {
            e.setReceiptPhoto(receiptPhoto.isBlank() ? null : receiptPhoto);
        }
        return expenseRepository.save(e);
    }

    /** Update the status of a MoMo-linked expense once the transfer resolves. */
    public void updateMomoExpenseStatus(String momoReferenceId, String status) {
        if (momoReferenceId == null || momoReferenceId.isBlank()) return;
        expenseRepository.findByMomoReferenceId(momoReferenceId).ifPresent(expense -> {
            expense.setStatus(status);
            expenseRepository.save(expense);
        });
    }

    public List<Expense> getUserExpenses(Long userId) {
        return expenseRepository.findByUserIdOrderByDateDesc(userId);
    }

    public List<Expense> getUserExpensesByCategory(Long userId, String category) {
        return expenseRepository.findByUserIdAndCategoryOrderByDateDesc(userId, category);
    }

    // Backward-compatible overload — no ownership check (legacy callers)
    public void deleteExpense(Long expenseId) {
        deleteExpense(expenseId, null);
    }

    /** Delete an expense, verifying it belongs to the requesting user when known. */
    public void deleteExpense(Long expenseId, Long userId) {
        Expense expense = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new RuntimeException("Expense not found: " + expenseId));
        if (userId != null && !expense.getUserId().equals(userId)) {
            throw new RuntimeException("Unauthorized: This expense does not belong to you");
        }
        expenseRepository.delete(expense);
    }

    // ─── Recurring expenses ──────────────────────────────────────────────────

    public List<Expense> getRecurringExpenses(Long userId) {
        return expenseRepository.findByUserIdAndIsRecurringTrueOrderByNextDueDateAsc(userId);
    }

    /**
     * Toggle recurring on/off for an expense. When enabling, recurrenceType must be
     * DAILY, WEEKLY or MONTHLY and nextDueDate is computed from today accordingly.
     */
    public Expense updateRecurring(Long expenseId, boolean isRecurring, String recurrenceType) {
        Expense expense = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new RuntimeException("Expense not found: " + expenseId));

        if (isRecurring) {
            String type = recurrenceType != null ? recurrenceType.trim().toUpperCase() : "";
            LocalDate next = switch (type) {
                case "DAILY"   -> LocalDate.now().plusDays(1);
                case "WEEKLY"  -> LocalDate.now().plusWeeks(1);
                case "MONTHLY" -> LocalDate.now().plusMonths(1);
                default -> throw new RuntimeException("recurrenceType must be DAILY, WEEKLY or MONTHLY");
            };
            expense.setIsRecurring(true);
            expense.setRecurrenceType(type);
            expense.setNextDueDate(next);
        } else {
            expense.setIsRecurring(false);
            expense.setRecurrenceType(null);
            expense.setNextDueDate(null);
        }
        return expenseRepository.save(expense);
    }

    // ─── Export ──────────────────────────────────────────────────────────────

    private static String csvEscape(String value) {
        if (value == null) return "";
        // Quote fields containing commas, quotes or newlines; double any quotes
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    /** CSV export: Date,Category,Description,Amount,PaymentMethod */
    public String buildCsvExport(Long userId) {
        List<Expense> expenses = expenseRepository.findByUserIdOrderByDateDesc(userId);
        StringBuilder sb = new StringBuilder("Date,Category,Description,Amount,PaymentMethod\n");
        for (Expense e : expenses) {
            sb.append(e.getDate() != null ? e.getDate().toString() : "").append(",")
              .append(csvEscape(e.getCategory())).append(",")
              .append(csvEscape(e.getDescription())).append(",")
              .append(e.getAmount() != null ? e.getAmount().toPlainString() : "0").append(",")
              .append(e.getPaymentMethod() != null ? e.getPaymentMethod() : "CASH").append("\n");
        }
        return sb.toString();
    }

    private static String htmlEscape(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Cleanly styled HTML table version of the expense list (frontend renders/prints it). */
    public String buildHtmlExport(Long userId) {
        List<Expense> expenses = expenseRepository.findByUserIdOrderByDateDesc(userId);

        BigDecimal total = expenses.stream()
                .map(e -> e.getAmount() != null ? e.getAmount().abs() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        StringBuilder rows = new StringBuilder();
        for (Expense e : expenses) {
            rows.append("<tr>")
                .append("<td>").append(e.getDate() != null ? e.getDate() : "").append("</td>")
                .append("<td>").append(htmlEscape(e.getCategory())).append("</td>")
                .append("<td>").append(htmlEscape(e.getDescription())).append("</td>")
                .append("<td style=\"text-align:right\">GHS ")
                .append(e.getAmount() != null ? e.getAmount().abs().setScale(2, RoundingMode.HALF_UP) : "0.00")
                .append("</td>")
                .append("<td>").append(e.getPaymentMethod() != null ? e.getPaymentMethod() : "CASH").append("</td>")
                .append("</tr>");
        }

        return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>"
                + "body{font-family:Helvetica,Arial,sans-serif;padding:24px;color:#111}"
                + "h1{font-size:20px;margin-bottom:2px} .sub{color:#666;font-size:12px;margin-bottom:16px}"
                + "table{width:100%;border-collapse:collapse;font-size:12px}"
                + "th{background:#111;color:#fff;text-align:left;padding:8px}"
                + "td{padding:8px;border-bottom:1px solid #eee}"
                + "tr:nth-child(even){background:#fafafa}"
                + ".total{margin-top:14px;font-size:14px;font-weight:bold;text-align:right}"
                + "</style></head><body>"
                + "<h1>💰 Tally — Expense Report</h1>"
                + "<div class=\"sub\">Generated " + LocalDate.now() + " • " + expenses.size() + " transactions</div>"
                + "<table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th></tr></thead>"
                + "<tbody>" + rows + "</tbody></table>"
                + "<div class=\"total\">Total: GHS " + total.setScale(2, RoundingMode.HALF_UP) + "</div>"
                + "</body></html>";
    }

    public Map<String, Object> getMonthlyReport(Long userId, Integer month, Integer year) {
        List<Expense> allExpenses = expenseRepository.findByUserIdOrderByDateDesc(userId);

        // API composition: budgets and shared-group data come from the owning
        // services, fetched concurrently. Capture the caller's JWT on this
        // thread — RequestContextHolder is not visible from the async pool.
        String authorization = BearerForward.currentAuthorization();
        CompletableFuture<List<Map<String, Object>>> budgetsFuture =
                CompletableFuture.supplyAsync(() -> budgetClient.getUserBudgets(userId, authorization));
        CompletableFuture<List<Map<String, Object>>> sharedFuture =
                CompletableFuture.supplyAsync(() -> groupDataClient.getUserSharedData(userId, authorization));
        List<Map<String, Object>> budgets;
        List<Map<String, Object>> sharedGroups;
        try {
            budgets = budgetsFuture.join();
            sharedGroups = sharedFuture.join();
        } catch (CompletionException ce) {
            if (ce.getCause() instanceof DownstreamUnavailableException d) throw d;
            throw new RuntimeException(ce.getCause() != null ? ce.getCause() : ce);
        }

        LocalDate now = LocalDate.now();
        int currentYear  = (year  != null) ? year  : now.getYear();
        int currentMonth = (month != null) ? month : now.getMonthValue();
        LocalDate anchor = LocalDate.of(currentYear, currentMonth, 1);
        int prevYear  = anchor.minusMonths(1).getYear();
        int prevMonth = anchor.minusMonths(1).getMonthValue();

        // Filter expenses by month
        List<Expense> currentMonthExpenses = allExpenses.stream()
                .filter(e -> e.getDate().getYear() == currentYear && e.getDate().getMonthValue() == currentMonth)
                .collect(Collectors.toList());

        List<Expense> previousMonthExpenses = allExpenses.stream()
                .filter(e -> e.getDate().getYear() == prevYear && e.getDate().getMonthValue() == prevMonth)
                .collect(Collectors.toList());

        // Totals — use absolute values so negative expense amounts sum correctly.
        // Settlements are income (money back), not spending — exclude them.
        BigDecimal currentTotal = currentMonthExpenses.stream()
                .filter(e -> !"SETTLEMENT".equals(e.getPaymentMethod()))
                .map(e -> e.getAmount().abs())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal previousTotal = previousMonthExpenses.stream()
                .filter(e -> !"SETTLEMENT".equals(e.getPaymentMethod()))
                .map(e -> e.getAmount().abs())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Include the user's share of shared (group) expenses as their spending —
        // business decision: your portion of a group bill IS money you spent.
        BigDecimal currentShared = BigDecimal.ZERO;
        BigDecimal previousShared = BigDecimal.ZERO;
        Set<Long> countedSharedIds = new HashSet<>();
        for (Map<String, Object> groupEntry : sharedGroups) {
            List<Map<String, Object>> groupMembers = asList(groupEntry.get("members"));
            for (Map<String, Object> se : asList(groupEntry.get("expenses"))) {
                BigDecimal amount = asBigDecimal(se.get("amount"));
                Object createdAt = se.get("createdAt");
                if (amount == null || createdAt == null) continue;
                Long seId = asLong(se.get("id"));
                if (seId != null && !countedSharedIds.add(seId)) continue;
                LocalDate d = LocalDateTime.parse(String.valueOf(createdAt)).toLocalDate();
                boolean inCurrent  = d.getYear() == currentYear && d.getMonthValue() == currentMonth;
                boolean inPrevious = d.getYear() == prevYear && d.getMonthValue() == prevMonth;
                if (!inCurrent && !inPrevious) continue;
                BigDecimal share = userShareOf(se, userId, groupMembers);
                if (share.compareTo(BigDecimal.ZERO) <= 0) continue;
                if (inCurrent) currentShared = currentShared.add(share);
                else previousShared = previousShared.add(share);
            }
        }
        currentTotal = currentTotal.add(currentShared);
        previousTotal = previousTotal.add(previousShared);

        // Percentage change
        double percentageChange = 0.0;
        if (previousTotal.compareTo(BigDecimal.ZERO) != 0) {
            percentageChange = currentTotal.subtract(previousTotal)
                    .divide(previousTotal, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100))
                    .doubleValue();
        }

        // Category breakdown for current month — use abs() for negative expense amounts
        Map<String, BigDecimal> categoryBreakdown = new HashMap<>();
        for (Expense e : currentMonthExpenses) {
            if ("SETTLEMENT".equals(e.getPaymentMethod())) continue;
            categoryBreakdown.merge(e.getCategory(), e.getAmount().abs(), BigDecimal::add);
        }
        if (currentShared.compareTo(BigDecimal.ZERO) > 0) {
            categoryBreakdown.merge("Shared", currentShared, BigDecimal::add);
        }

        // Highest category
        Map<String, Object> highestCategory = new HashMap<>();
        categoryBreakdown.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(entry -> {
                    highestCategory.put("category", entry.getKey());
                    highestCategory.put("amount", entry.getValue());
                });

        // Budget performance — budget list fetched from budget-service
        List<Map<String, Object>> budgetPerformance = new ArrayList<>();
        for (Map<String, Object> budget : budgets != null ? budgets : List.<Map<String, Object>>of()) {
            String category = String.valueOf(budget.get("category"));
            BigDecimal monthlyLimit = asBigDecimal(budget.get("monthlyLimit"));
            if (monthlyLimit == null) continue;
            BigDecimal spent = categoryBreakdown.getOrDefault(category, BigDecimal.ZERO);
            double percentage = monthlyLimit.compareTo(BigDecimal.ZERO) > 0
                    ? spent.divide(monthlyLimit, 4, RoundingMode.HALF_UP)
                            .multiply(BigDecimal.valueOf(100)).doubleValue()
                    : 0.0;

            String status = spent.compareTo(monthlyLimit) > 0 ? "over"
                    : percentage >= 80 ? "warning"
                    : "good";

            Map<String, Object> entry = new HashMap<>();
            entry.put("category", category);
            entry.put("limit", monthlyLimit);
            entry.put("spent", spent);
            entry.put("percentage", percentage);
            entry.put("status", status);
            budgetPerformance.add(entry);
        }

        Map<String, Object> report = new HashMap<>();
        report.put("currentMonth", currentTotal);
        report.put("previousMonth", previousTotal);
        report.put("percentageChange", percentageChange);
        report.put("highestCategory", highestCategory);
        report.put("categoryBreakdown", categoryBreakdown);
        report.put("budgetPerformance", budgetPerformance);
        return report;
    }

    /**
     * The user's share of a shared expense (DTO form, from group-service),
     * honoring the participant snapshot and CUSTOM split ratios — same math
     * as before the microservices correction.
     */
    private BigDecimal userShareOf(Map<String, Object> se, Long userId,
                                   List<Map<String, Object>> members) {
        Set<Long> participants = new HashSet<>();
        Object participantIds = se.get("participantIds");
        if (participantIds != null && !String.valueOf(participantIds).isBlank()) {
            for (String s : String.valueOf(participantIds).split(",")) {
                try {
                    participants.add(Long.parseLong(s.trim()));
                } catch (NumberFormatException ignored) {
                    // skip malformed token
                }
            }
        }
        if (participants.isEmpty()) {
            for (Map<String, Object> m : members) {
                Long id = asLong(m.get("userId"));
                if (id != null) participants.add(id);
            }
        }
        if (!participants.contains(userId)) return BigDecimal.ZERO;

        BigDecimal amount = asBigDecimal(se.get("amount"));
        if (amount == null) return BigDecimal.ZERO;

        if ("CUSTOM".equals(se.get("splitType")) && se.get("splitRatios") != null) {
            try {
                Map<String, Object> raw = shareMapper.readValue(
                        String.valueOf(se.get("splitRatios")), shareMapper.getTypeFactory()
                                .constructMapType(HashMap.class, String.class, Object.class));
                Object pct = raw.get(String.valueOf(userId));
                if (pct == null) return BigDecimal.ZERO;
                return amount.multiply(new BigDecimal(String.valueOf(pct)))
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            } catch (Exception ignored) {
                // fall through to equal split
            }
        }
        return amount.divide(
                BigDecimal.valueOf(Math.max(participants.size(), 1)), 2, RoundingMode.HALF_UP);
    }

    public List<Map<String, Object>> getCombinedHistory(Long userId) {
        List<Map<String, Object>> combined = new ArrayList<>();

        // 1. Personal expenses
        List<Expense> personalExpenses = expenseRepository.findByUserIdOrderByDateDesc(userId);
        for (Expense e : personalExpenses) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("id", e.getId());
            entry.put("amount", e.getAmount());
            entry.put("category", e.getCategory());
            entry.put("description", e.getDescription());
            entry.put("date", e.getDate().toString());
            // Income is stored as a positive amount; expenses are stored
            // negative. MoMo vendor transfers are money-out but stored
            // positive, and settlements have their own handling — exclude both
            // so only genuine income is flagged. The app colours income green
            // (+) and everything else red (-), keying off this type.
            String personalPm = e.getPaymentMethod();
            boolean isIncome = e.getAmount() != null
                    && e.getAmount().signum() > 0
                    && !"MOMO_TRANSFER".equalsIgnoreCase(personalPm)
                    && !"SETTLEMENT".equalsIgnoreCase(personalPm);
            entry.put("type", isIncome ? "income" : "personal");
            entry.put("isExpense", !isIncome);
            entry.put("status", e.getStatus() != null ? e.getStatus() : "COMPLETED");
            entry.put("notes", e.getNotes());
            entry.put("hasReceipt", e.getReceiptPhoto() != null);
            entry.put("momoReferenceId", e.getMomoReferenceId());
            entry.put("groupId", null);
            entry.put("paymentMethod", e.getPaymentMethod() != null ? e.getPaymentMethod() : "CASH");
            entry.put("isRecurring", Boolean.TRUE.equals(e.getIsRecurring()));
            entry.put("recurrenceType", e.getRecurrenceType());
            entry.put("nextDueDate", e.getNextDueDate() != null ? e.getNextDueDate().toString() : null);
            entry.put("createdAt", e.getCreatedAt() != null ? e.getCreatedAt().toString() : null);
            combined.add(entry);
        }

        // 2. All shared expenses from groups this user belongs to — via
        //    group-service's aggregate API (names already enriched there)
        List<Map<String, Object>> sharedGroups =
                groupDataClient.getUserSharedData(userId, BearerForward.currentAuthorization());
        Set<Long> seenSharedIds = new HashSet<>();
        for (Map<String, Object> groupEntry : sharedGroups) {
            String groupName = String.valueOf(groupEntry.get("groupName"));
            Long groupId = asLong(groupEntry.get("groupId"));
            for (Map<String, Object> se : asList(groupEntry.get("expenses"))) {
                Long seId = asLong(se.get("id"));
                if (seId == null || seenSharedIds.contains(seId)) continue;
                seenSharedIds.add(seId);
                Object createdAt = se.get("createdAt");
                Object description = se.get("description");
                Map<String, Object> entry = new HashMap<>();
                entry.put("id", seId);
                // Amount stays positive; the frontend renders shared entries as
                // expenses (minus sign / red) because isExpense is true.
                entry.put("amount", asBigDecimal(se.get("amount")));
                entry.put("category", "Shared");
                entry.put("description", description != null
                        ? "Paid for " + description + " in " + groupName
                        : "Paid in " + groupName);
                entry.put("date", createdAt != null
                        ? LocalDateTime.parse(String.valueOf(createdAt)).toLocalDate().toString()
                        : LocalDate.now().toString());
                entry.put("type", "shared");
                entry.put("isExpense", true);
                entry.put("settled", Boolean.TRUE.equals(se.get("settled")));
                entry.put("groupId", groupId);
                entry.put("groupName", groupName);
                entry.put("paidBy", asLong(se.get("paidBy")));
                entry.put("paidByName", se.get("paidByName"));
                // Shared expenses have no stored payment method — default to CASH
                // so every history entry carries the field.
                entry.put("paymentMethod", "CASH");
                entry.put("createdAt", createdAt != null ? String.valueOf(createdAt) : null);
                combined.add(entry);
            }
        }

        // 3. Sort by date descending, then by createdAt descending for same-day entries
        combined.sort((a, b) -> {
            int dateCmp = ((String) b.get("date")).compareTo((String) a.get("date"));
            if (dateCmp != 0) return dateCmp;
            String aCreated = (String) a.get("createdAt");
            String bCreated = (String) b.get("createdAt");
            if (aCreated == null && bCreated == null) return 0;
            if (aCreated == null) return 1;
            if (bCreated == null) return -1;
            return bCreated.compareTo(aCreated);
        });

        return combined;
    }
}
