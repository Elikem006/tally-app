package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Expense;
import user_service.repository.ExpenseRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
public class ExpenseService {

    @Autowired
    private ExpenseRepository expenseRepository;

    public Expense createExpense(Long userId, BigDecimal amount, String category,
                                 String description, LocalDate date) {
        Expense expense = new Expense();
        expense.setUserId(userId);
        expense.setAmount(amount);
        expense.setCategory(category);
        expense.setDescription(description);
        expense.setDate(date);
        return expenseRepository.save(expense);
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
}