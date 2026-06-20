package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Budget;
import user_service.model.Expense;
import user_service.repository.BudgetRepository;
import user_service.repository.ExpenseRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BudgetService {

    @Autowired
    private BudgetRepository budgetRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

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

    public Map<String, Object> getBudgetSummary(Long userId) {
        List<Budget> budgets = budgetRepository.findByUserId(userId);
        List<Expense> expenses = expenseRepository.findByUserIdOrderByDateDesc(userId);

        Map<String, BigDecimal> spent = new HashMap<>();
        for (Expense e : expenses) {
            spent.merge(e.getCategory(), e.getAmount(), BigDecimal::add);
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

            summary.put(b.getCategory(), categoryData);
        }
        return summary;
    }
}