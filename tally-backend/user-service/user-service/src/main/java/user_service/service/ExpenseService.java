package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Budget;
import user_service.model.Expense;
import user_service.model.Group;
import user_service.model.GroupMember;
import user_service.model.SharedExpense;
import user_service.model.User;
import user_service.repository.BudgetRepository;
import user_service.repository.ExpenseRepository;
import user_service.repository.GroupMemberRepository;
import user_service.repository.GroupRepository;
import user_service.repository.SharedExpenseRepository;
import user_service.repository.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ExpenseService {

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private BudgetRepository budgetRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SharedExpenseRepository sharedExpenseRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GroupRepository groupRepository;

    private String resolveUserName(Long userId) {
        if (userId == null) return "Unknown";
        return userRepository.findById(userId)
                .map(User::getName)
                .orElse("User #" + userId);
    }

    private String resolveGroupName(Long groupId) {
        if (groupId == null) return "Unknown Group";
        return groupRepository.findById(groupId)
                .map(Group::getName)
                .orElse("Group #" + groupId);
    }

    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date, String paymentMethod) {
        // Sanitize description: trim whitespace; treat blank as null
        if (description != null) {
            description = description.trim();
            if (description.isEmpty()) description = null;
        }

        Expense expense = new Expense();
        expense.setUserId(userId);
        expense.setAmount(amount);
        expense.setCategory(category);
        expense.setDescription(description);
        expense.setDate(date);
        expense.setPaymentMethod(paymentMethod != null && !paymentMethod.isBlank() ? paymentMethod : "CASH");
        return expenseRepository.save(expense);
    }

    // Overload for backward compatibility
    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date) {
        return createExpense(userId, amount, category, description, date, "CASH");
    }

    public List<Expense> getUserExpenses(Long userId) {
        return expenseRepository.findByUserIdOrderByDateDesc(userId);
    }

    public List<Expense> getUserExpensesByCategory(Long userId, String category) {
        return expenseRepository.findByUserIdAndCategoryOrderByDateDesc(userId, category);
    }

    public void deleteExpense(Long expenseId) {
        expenseRepository.deleteById(expenseId);
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

        // Totals — use absolute values so negative expense amounts sum correctly
        BigDecimal currentTotal = currentMonthExpenses.stream()
                .map(e -> e.getAmount().abs())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal previousTotal = previousMonthExpenses.stream()
                .map(e -> e.getAmount().abs())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

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
            categoryBreakdown.merge(e.getCategory(), e.getAmount().abs(), BigDecimal::add);
        }

        // Highest category
        Map<String, Object> highestCategory = new HashMap<>();
        categoryBreakdown.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(entry -> {
                    highestCategory.put("category", entry.getKey());
                    highestCategory.put("amount", entry.getValue());
                });

        // Budget performance
        List<Budget> budgets = budgetRepository.findByUserId(userId);
        List<Map<String, Object>> budgetPerformance = new ArrayList<>();
        for (Budget budget : budgets) {
            BigDecimal spent = categoryBreakdown.getOrDefault(budget.getCategory(), BigDecimal.ZERO);
            double percentage = budget.getMonthlyLimit().compareTo(BigDecimal.ZERO) > 0
                    ? spent.divide(budget.getMonthlyLimit(), 4, RoundingMode.HALF_UP)
                            .multiply(BigDecimal.valueOf(100)).doubleValue()
                    : 0.0;

            String status = spent.compareTo(budget.getMonthlyLimit()) > 0 ? "over"
                    : percentage >= 80 ? "warning"
                    : "good";

            Map<String, Object> entry = new HashMap<>();
            entry.put("category", budget.getCategory());
            entry.put("limit", budget.getMonthlyLimit());
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
            entry.put("type", "personal");
            entry.put("groupId", null);
            entry.put("paymentMethod", e.getPaymentMethod() != null ? e.getPaymentMethod() : "CASH");
            entry.put("isRecurring", Boolean.TRUE.equals(e.getIsRecurring()));
            entry.put("recurrenceType", e.getRecurrenceType());
            entry.put("nextDueDate", e.getNextDueDate() != null ? e.getNextDueDate().toString() : null);
            entry.put("createdAt", e.getCreatedAt() != null ? e.getCreatedAt().toString() : null);
            combined.add(entry);
        }

        // 2. All shared expenses from groups this user belongs to
        Set<Long> seenSharedIds = new HashSet<>();
        List<GroupMember> memberships = groupMemberRepository.findByUserId(userId);
        for (GroupMember membership : memberships) {
            List<SharedExpense> sharedExpenses = sharedExpenseRepository.findByGroupId(membership.getGroupId());
            for (SharedExpense se : sharedExpenses) {
                if (seenSharedIds.contains(se.getId())) continue;
                seenSharedIds.add(se.getId());
                Map<String, Object> entry = new HashMap<>();
                entry.put("id", se.getId());
                entry.put("amount", se.getAmount());
                entry.put("category", "Shared");
                entry.put("description", se.getDescription());
                entry.put("date", se.getCreatedAt() != null
                        ? se.getCreatedAt().toLocalDate().toString()
                        : LocalDate.now().toString());
                entry.put("type", "shared");
                entry.put("groupId", se.getGroupId());
                entry.put("groupName", resolveGroupName(se.getGroupId()));
                entry.put("paidBy", se.getPaidBy());
                entry.put("paidByName", resolveUserName(se.getPaidBy()));
                // Shared expenses have no stored payment method — default to CASH
                // so every history entry carries the field.
                entry.put("paymentMethod", "CASH");
                entry.put("createdAt", se.getCreatedAt() != null ? se.getCreatedAt().toString() : null);
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