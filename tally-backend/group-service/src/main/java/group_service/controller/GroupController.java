package group_service.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import group_service.AuthGuard;
import group_service.model.Group;
import group_service.model.GroupMember;
import group_service.model.SharedExpense;
import group_service.service.GroupService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/groups")
public class GroupController {

    @Autowired
    private GroupService groupService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    // POST /api/groups — create a group
    @PostMapping
    public ResponseEntity<?> createGroup(@RequestBody Map<String, String> request,
                                         HttpServletRequest httpRequest) {
        try {
            String name = request.get("name");
            String createdByStr = request.get("createdBy");

            if (name == null || name.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Group name is required", "success", false));
            }
            if (createdByStr == null || createdByStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "createdBy is required", "success", false));
            }

            Long createdBy = Long.parseLong(createdByStr);
            AuthGuard.requireSameUser(httpRequest, createdBy);
            Group group = groupService.createGroup(name.trim(), createdBy);
            return ResponseEntity.status(HttpStatus.CREATED).body(group);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // POST /api/groups/:id/members — add a member
    @PostMapping("/{groupId}/members")
    public ResponseEntity<?> addMember(
            @PathVariable Long groupId,
            @RequestBody Map<String, String> request) {
        try {
            String userIdStr = request.get("userId");
            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId is required", "success", false));
            }
            Long userId = Long.parseLong(userIdStr);
            GroupMember member = groupService.addMember(groupId, userId);
            return ResponseEntity.status(HttpStatus.CREATED).body(member);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // GET /api/groups/user/:id/net — total owed/owing across ALL groups
    @GetMapping("/user/{userId}/net")
    public ResponseEntity<?> getUserNetBalance(@PathVariable Long userId) {
        try {
            Map<String, Object> net = groupService.getUserNetBalance(userId);
            net.put("success", true);
            return ResponseEntity.ok(net);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
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
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // DELETE /api/groups/:id/members/:userId — remove a member (creator only).
    // The requester is taken from the JWT; the query param is only a fallback.
    @DeleteMapping("/{groupId}/members/{userId}")
    public ResponseEntity<?> removeMember(
            @PathVariable Long groupId,
            @PathVariable Long userId,
            @RequestParam(required = false) Long requestingUserId,
            HttpServletRequest httpRequest) {
        try {
            AuthGuard.requireSameUser(httpRequest, requestingUserId);
            Long effectiveRequester = requestingUserId != null
                    ? requestingUserId : AuthGuard.authUserId(httpRequest);
            groupService.removeMember(groupId, userId, effectiveRequester);
            return ResponseEntity.ok(Map.of("message", "Member removed successfully", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // GET /api/groups/:id — group details with members and expenses.
    // Optional viewingUserId personalizes each expense (userShare, isPayer, displayAmount).
    @GetMapping("/{groupId}")
    public ResponseEntity<?> getGroupDetails(
            @PathVariable Long groupId,
            @RequestParam(required = false) Long viewingUserId) {
        try {
            Map<String, Object> details = groupService.getGroupDetails(groupId, viewingUserId);
            // GroupService creates a new HashMap — safe to mutate directly
            details.put("success", true);
            return ResponseEntity.ok(details);
        } catch (group_service.client.DownstreamUnavailableException e) {
            return ResponseEntity.status(503)
                    .body(Map.of("error", e.getMessage(), "success", false));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
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
                        .body(Map.of("error", "paidBy, amount and description are required", "success", false));
            }

            // Trim before empty-check so "   " is treated as empty
            description = description.trim();
            if (description.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Description cannot be empty", "success", false));
            }

            Long paidBy = Long.parseLong(paidByStr);
            BigDecimal amount = new BigDecimal(amountStr);

            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must be greater than zero", "success", false));
            }

            // Split type: EQUAL (default) or CUSTOM with a userId → percentage JSON map
            String splitType = request.getOrDefault("splitType", "EQUAL");
            String splitRatios = request.get("splitRatios");

            if ("CUSTOM".equalsIgnoreCase(splitType)) {
                if (splitRatios == null || splitRatios.isBlank()) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "splitRatios is required when splitType is CUSTOM", "success", false));
                }
            } else {
                splitType = "EQUAL";
                splitRatios = null; // ignored for equal splits
            }

            SharedExpense expense = groupService.addSharedExpense(
                    groupId, paidBy, amount, description, splitType, splitRatios);
            return ResponseEntity.status(HttpStatus.CREATED).body(expense);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // GET /api/groups/:id/balances — calculate who owes whom
    @GetMapping("/{groupId}/balances")
    public ResponseEntity<?> getBalances(@PathVariable Long groupId) {
        try {
            List<Map<String, Object>> balances = groupService.calculateBalances(groupId);
            return ResponseEntity.ok(balances);
        } catch (group_service.client.DownstreamUnavailableException e) {
            return ResponseEntity.status(503)
                    .body(Map.of("error", e.getMessage(), "success", false));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // POST /api/groups/:id/settle — settle up (optionally with MoMo payment).
    // The body userId must match the authenticated JWT user — nobody can
    // settle on someone else's behalf.
    @PostMapping("/{groupId}/settle")
    public ResponseEntity<?> settleUp(
            @PathVariable Long groupId,
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {
        try {
            String userIdStr = request.get("userId");
            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId is required", "success", false));
            }
            Long userId = Long.parseLong(userIdStr);
            AuthGuard.requireSameUser(httpRequest, userId);
            String phoneNumber = request.get("phoneNumber"); // optional
            Map<String, Object> result = groupService.settleUp(groupId, userId, phoneNumber);
            // GroupService creates a new HashMap — safe to mutate directly
            result.put("success", true);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<?> deleteGroup(@PathVariable Long groupId) {
        try {
            groupService.deleteGroup(groupId);
            return ResponseEntity.ok(Map.of("message", "Group deleted successfully", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/groups/user/:id/shared-data — internal aggregate used by
     * expense-service's report/history composition (instead of expense-service
     * reading group tables directly). Same-user JWT enforcement applies via
     * the /user/{id} path check in JwtAuthFilter.
     */
    @GetMapping("/user/{userId}/shared-data")
    public ResponseEntity<?> getUserSharedData(@PathVariable Long userId) {
        try {
            Map<String, Object> data = groupService.getUserSharedData(userId);
            data.put("success", true);
            return ResponseEntity.ok(data);
        } catch (group_service.client.DownstreamUnavailableException e) {
            return ResponseEntity.status(503)
                    .body(Map.of("error", e.getMessage(), "success", false));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
