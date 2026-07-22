package budget_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import budget_service.client.BearerForward;
import budget_service.client.ExpenseClient;
import budget_service.model.Budget;
import budget_service.repository.BudgetRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BudgetService {

    @Autowired
    private BudgetRepository budgetRepository;

    @Autowired
    private ExpenseClient expenseClient;

    public Budget setBudget(Long userId, String category, BigDecimal monthlyLimit) {
        // Check if budget already exists for this category
        Optional<Budget> existing = budgetRepository.findByUserIdAndCategory(userId, category);

        Budget budget;
        if (existing.isPresent()) {
            // Update existing budget
            budget = existing.get();
            budget.setMonthlyLimit(monthlyLimit);
        } else {
            // Create new budget
            budget = new Budget();
            budget.setUserId(userId);
            budget.setCategory(category);
            budget.setMonthlyLimit(monthlyLimit);
        }
        return budgetRepository.save(budget);
    }

    public List<Budget> getUserBudgets(Long userId) {
        return budgetRepository.findByUserId(userId);
    }

    public void deleteBudget(Long userId, String category) {
        Optional<Budget> existing = budgetRepository.findByUserIdAndCategory(userId, category);
        existing.ifPresent(budgetRepository::delete);
    }

    /**
     * Budget summary. Expense data now comes from expense-service's API
     * (caller's JWT forwarded) instead of a direct read of the expenses table.
     * The calculation itself is unchanged — same keys, same milestone bands.
     */
    public Map<String, Object> getBudgetSummary(Long userId) {
        List<Budget> budgets = budgetRepository.findByUserId(userId);
        List<Map<String, Object>> expenses =
                expenseClient.getUserExpenses(userId, BearerForward.currentAuthorization());

        // Only count spending for the current month
        LocalDate now = LocalDate.now();
        int currentYear  = now.getYear();
        int currentMonth = now.getMonthValue();

        Map<String, BigDecimal> spent = new HashMap<>();
        if (expenses != null) {
            for (Map<String, Object> e : expenses) {
                Object dateRaw = e.get("date");
                Object amountRaw = e.get("amount");
                Object categoryRaw = e.get("category");
                if (dateRaw == null || amountRaw == null) continue;
                LocalDate date = LocalDate.parse(String.valueOf(dateRaw));
                if (date.getYear() == currentYear && date.getMonthValue() == currentMonth) {
                    // Use absolute value so negative expense amounts are summed correctly
                    BigDecimal amount = new BigDecimal(String.valueOf(amountRaw));
                    spent.merge(String.valueOf(categoryRaw), amount.abs(), BigDecimal::add);
                }
            }
        }

        Map<String, Object> summary = new HashMap<>();
        for (Budget b : budgets) {
            BigDecimal spentAmount = spent.getOrDefault(b.getCategory(), BigDecimal.ZERO);
            double percentage = b.getMonthlyLimit().compareTo(BigDecimal.ZERO) > 0
                    ? spentAmount.divide(b.getMonthlyLimit(), 4, java.math.RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)).doubleValue()
                    : 0;

            Map<String, Object> categoryData = new HashMap<>();
            categoryData.put("limit", b.getMonthlyLimit());
            categoryData.put("spent", spentAmount);
            categoryData.put("percentage", percentage);
            categoryData.put("isOverBudget", spentAmount.compareTo(b.getMonthlyLimit()) > 0);
            categoryData.put("isNearLimit", percentage >= 80);
            // Milestone bands for notifications: exactly one of these is true once ≥50%
            categoryData.put("reached50", percentage >= 50 && percentage < 80);
            categoryData.put("reached80", percentage >= 80 && percentage < 100);
            categoryData.put("reached100", percentage >= 100);

            summary.put(b.getCategory(), categoryData);
        }
        return summary;
    }
}
