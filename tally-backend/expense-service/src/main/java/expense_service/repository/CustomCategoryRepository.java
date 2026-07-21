package expense_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import expense_service.model.CustomCategory;
import java.util.List;

@Repository
public interface CustomCategoryRepository extends JpaRepository<CustomCategory, Long> {
    List<CustomCategory> findByUserId(Long userId);
    boolean existsByUserIdAndNameIgnoreCase(Long userId, String name);

    @Transactional
    void deleteByIdAndUserId(Long id, Long userId);
}
