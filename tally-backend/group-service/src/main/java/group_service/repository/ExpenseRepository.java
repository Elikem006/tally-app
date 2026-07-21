package group_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import group_service.model.Expense;
import java.util.List;
import java.util.Optional;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, Long> {
    List<Expense> findByUserIdOrderByDateDesc(Long userId);
    List<Expense> findByUserIdAndCategoryOrderByDateDesc(Long userId, String category);
    List<Expense> findByUserIdAndIsRecurringTrueOrderByNextDueDateAsc(Long userId);
    Optional<Expense> findByMomoReferenceId(String momoReferenceId);
    long countByUserIdAndCategory(Long userId, String category);
}