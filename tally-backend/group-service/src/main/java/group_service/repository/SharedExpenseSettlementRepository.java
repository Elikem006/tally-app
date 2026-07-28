package group_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import group_service.model.SharedExpenseSettlement;
import java.util.List;

@Repository
public interface SharedExpenseSettlementRepository extends JpaRepository<SharedExpenseSettlement, Long> {
    List<SharedExpenseSettlement> findBySharedExpenseIdIn(List<Long> sharedExpenseIds);
    boolean existsBySharedExpenseIdAndUserId(Long sharedExpenseId, Long userId);
}
