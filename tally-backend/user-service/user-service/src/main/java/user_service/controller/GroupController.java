package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.Group;
import user_service.model.GroupMember;
import user_service.model.SharedExpense;
import user_service.service.GroupService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/groups")
@CrossOrigin(origins = "*")
public class GroupController {

    @Autowired
    private GroupService groupService;

    // POST /api/groups — create a group
    @PostMapping
    public ResponseEntity<?> createGroup(@RequestBody Map<String, String> request) {
        try {
            String name = request.get("name");
            Long createdBy = Long.parseLong(request.get("createdBy"));

            if (name == null || name.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Group name is required"));
            }

            Group group = groupService.createGroup(name, createdBy);
            return ResponseEntity.ok(group);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // POST /api/groups/:id/members — add a member
    @PostMapping("/{groupId}/members")
    public ResponseEntity<?> addMember(
            @PathVariable Long groupId,
            @RequestBody Map<String, String> request) {
        try {
            Long userId = Long.parseLong(request.get("userId"));
            GroupMember member = groupService.addMember(groupId, userId);
            return ResponseEntity.ok(member);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // GET /api/groups/user/:id — get all groups for a user
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserGroups(@PathVariable Long userId) {
        try {
            List<Group> groups = groupService.getUserGroups(userId);
            return ResponseEntity.ok(groups);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // GET /api/groups/:id — group details with members and expenses
    @GetMapping("/{groupId}")
    public ResponseEntity<?> getGroupDetails(@PathVariable Long groupId) {
        try {
            Map<String, Object> details = groupService.getGroupDetails(groupId);
            return ResponseEntity.ok(details);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // POST /api/groups/:id/expenses — add a shared expense
    @PostMapping("/{groupId}/expenses")
    public ResponseEntity<?> addSharedExpense(
            @PathVariable Long groupId,
            @RequestBody Map<String, String> request) {
        try {
            String paidByStr = request.get("paidBy");
            String amountStr = request.get("amount");
            String description = request.get("description");

            if (paidByStr == null || amountStr == null || description == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "paidBy, amount and description are required"));
            }

            if (description.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Description cannot be empty"));
            }

            Long paidBy = Long.parseLong(paidByStr);
            BigDecimal amount = new BigDecimal(amountStr);

            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must be greater than zero"));
            }

            SharedExpense expense = groupService.addSharedExpense(
                    groupId, paidBy, amount, description);
            return ResponseEntity.ok(expense);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // GET /api/groups/:id/balances — calculate who owes whom
    @GetMapping("/{groupId}/balances")
    public ResponseEntity<?> getBalances(@PathVariable Long groupId) {
        try {
            List<Map<String, Object>> balances = groupService.calculateBalances(groupId);
            return ResponseEntity.ok(balances);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // POST /api/groups/:id/settle — settle up
    @PostMapping("/{groupId}/settle")
    public ResponseEntity<?> settleUp(
            @PathVariable Long groupId,
            @RequestBody Map<String, String> request) {
        try {
            Long userId = Long.parseLong(request.get("userId"));
            Map<String, Object> result = groupService.settleUp(groupId, userId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }
}