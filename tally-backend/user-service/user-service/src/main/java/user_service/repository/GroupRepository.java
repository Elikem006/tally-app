package user_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import user_service.model.Group;
import java.util.List;

@Repository
public interface GroupRepository extends JpaRepository<Group, Long> {

    @Query("SELECT g FROM Group g JOIN GroupMember gm ON g.id = gm.groupId WHERE gm.userId = :userId")
    List<Group> findGroupsByUserId(@Param("userId") Long userId);
}