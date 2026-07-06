package user_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Group;
import user_service.model.GroupMember;
import user_service.model.SharedExpense;
import user_service.model.User;
import user_service.repository.GroupMemberRepository;
import user_service.repository.GroupRepository;
import user_service.repository.SharedExpenseRepository;
import user_service.repository.UserRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class GroupService {

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SharedExpenseRepository sharedExpenseRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MoMoService moMoService;

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    /**
     * Parse a splitRatios JSON string ({"1": 60, "2": 40}) into userId → percentage.
     * Throws with a user-readable message when the JSON is malformed.
     */
    private Map<Long, BigDecimal> parseSplitRatios(String splitRatios) {
        try {
            Map<String, Object> raw = objectMapper.readValue(
                    splitRatios, objectMapper.getTypeFactory()
                            .constructMapType(HashMap.class, String.class, Object.class));
            Map<Long, BigDecimal> ratios = new HashMap<>();
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                ratios.put(Long.parseLong(e.getKey().trim()), new BigDecimal(String.valueOf(e.getValue())));
            }
            return ratios;
        } catch (Exception e) {
            throw new RuntimeException("splitRatios must be valid JSON mapping userId to percentage, e.g. {\"1\": 60, \"2\": 40}");
        }
    }

    /**
     * A member's share of an expense: percentage-based when the expense uses a
     * CUSTOM split, otherwise an equal share. Falls back to equal split if a
     * stored ratio string can no longer be parsed.
     */
    private BigDecimal shareFor(SharedExpense expense, Long memberId, int memberCount) {
        if ("CUSTOM".equals(expense.getSplitType()) && expense.getSplitRatios() != null) {
            try {
                Map<Long, BigDecimal> ratios = parseSplitRatios(expense.getSplitRatios());
                BigDecimal pct = ratios.getOrDefault(memberId, BigDecimal.ZERO);
                return expense.getAmount().multiply(pct)
                        .divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);
            } catch (Exception ignored) {
                // fall through to equal split
            }
        }
        return expense.getAmount()
                .divide(BigDecimal.valueOf(Math.max(memberCount, 1)), 2, RoundingMode.HALF_UP);
    }

    // Fetch a user once and return it (null-safe)
    private User findUser(Long userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).orElse(null);
    }

    private String resolveUserName(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getName() : "User #" + userId;
    }

    private String resolveAvatarData(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getAvatarData() : null;
    }

    private String resolveAvatarType(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getAvatarType() : null;
    }

    // Create a new group
    public Group createGroup(String name, Long createdBy) {
        Group group = new Group();
        group.setName(name);
        group.setCreatedBy(createdBy);
        group = groupRepository.save(group);

        GroupMember member = new GroupMember();
        member.setGroupId(group.getId());
        member.setUserId(createdBy);
        groupMemberRepository.save(member);

        return group;
    }

    // Add a member to a group
    public GroupMember addMember(Long groupId, Long userId) {
        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is already a member of this group");
        }
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setUserId(userId);
        return groupMemberRepository.save(member);
    }

    // Get all groups for a user
    public List<Group> getUserGroups(Long userId) {
        return groupRepository.findGroupsByUserId(userId);
    }

    // Get group details — members and expenses enriched with names
    public Map<String, Object> getGroupDetails(Long groupId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        // Enrich members with name + avatar
        List<Map<String, Object>> enrichedMembers = new ArrayList<>();
        for (GroupMember m : members) {
            User u = findUser(m.getUserId());
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",         m.getId());
            entry.put("groupId",    m.getGroupId());
            entry.put("userId",     m.getUserId());
            entry.put("joinedAt",   m.getJoinedAt() != null ? m.getJoinedAt().toString() : null);
            entry.put("name",       u != null ? u.getName()       : "User #" + m.getUserId());
            entry.put("avatarData", u != null ? u.getAvatarData() : null);
            entry.put("avatarType", u != null ? u.getAvatarType() : null);
            enrichedMembers.add(entry);
        }

        // Enrich expenses with paidByName + paidByAvatarData
        List<Map<String, Object>> enrichedExpenses = new ArrayList<>();
        for (SharedExpense se : expenses) {
            User payer = findUser(se.getPaidBy());
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",              se.getId());
            entry.put("groupId",         se.getGroupId());
            entry.put("paidBy",          se.getPaidBy());
            entry.put("paidByName",      payer != null ? payer.getName()       : "User #" + se.getPaidBy());
            entry.put("paidByAvatarData",payer != null ? payer.getAvatarData() : null);
            entry.put("paidByAvatarType",payer != null ? payer.getAvatarType() : null);
            entry.put("amount",          se.getAmount());
            entry.put("description",     se.getDescription());
            entry.put("splitType",       se.getSplitType() != null ? se.getSplitType() : "EQUAL");
            entry.put("splitRatios",     se.getSplitRatios());
            entry.put("createdAt",       se.getCreatedAt() != null ? se.getCreatedAt().toString() : null);
            enrichedExpenses.add(entry);
        }

        Map<String, Object> details = new HashMap<>();
        details.put("group",    group);
        details.put("members",  enrichedMembers);
        details.put("expenses", enrichedExpenses);
        return details;
    }

    // Add a shared expense to a group (EQUAL split)
    public SharedExpense addSharedExpense(Long groupId, Long paidBy, BigDecimal amount, String description) {
        return addSharedExpense(groupId, paidBy, amount, description, "EQUAL", null);
    }

    /**
     * Add a shared expense with either an EQUAL split or a CUSTOM percentage split.
     * For CUSTOM, splitRatios is a JSON map of userId → percentage that must cover
     * every group member and sum to exactly 100.
     */
    public SharedExpense addSharedExpense(Long groupId, Long paidBy, BigDecimal amount,
                                          String description, String splitType, String splitRatios) {
        // Sanitize description: trim whitespace; treat blank as null
        if (description != null) {
            description = description.trim();
            if (description.isEmpty()) description = null;
        }

        boolean custom = "CUSTOM".equalsIgnoreCase(splitType) && splitRatios != null && !splitRatios.isBlank();

        if (custom) {
            Map<Long, BigDecimal> ratios = parseSplitRatios(splitRatios);
            List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);

            // Every group member must have a ratio
            for (GroupMember m : members) {
                if (!ratios.containsKey(m.getUserId())) {
                    throw new RuntimeException("Split ratios must include every group member (missing user #" + m.getUserId() + ")");
                }
            }
            // No ratios for people outside the group
            Set<Long> memberIds = new HashSet<>();
            for (GroupMember m : members) memberIds.add(m.getUserId());
            for (Long ratioUserId : ratios.keySet()) {
                if (!memberIds.contains(ratioUserId)) {
                    throw new RuntimeException("Split ratios include user #" + ratioUserId + " who is not a group member");
                }
            }
            // Percentages must be non-negative and sum to exactly 100
            BigDecimal sum = BigDecimal.ZERO;
            for (BigDecimal pct : ratios.values()) {
                if (pct.compareTo(BigDecimal.ZERO) < 0) {
                    throw new RuntimeException("Split percentages cannot be negative");
                }
                sum = sum.add(pct);
            }
            if (sum.compareTo(ONE_HUNDRED) != 0) {
                throw new RuntimeException("Split percentages must add up to exactly 100 (got " + sum.stripTrailingZeros().toPlainString() + ")");
            }
        }

        SharedExpense expense = new SharedExpense();
        expense.setGroupId(groupId);
        expense.setPaidBy(paidBy);
        expense.setAmount(amount);
        expense.setDescription(description);
        expense.setSplitType(custom ? "CUSTOM" : "EQUAL");
        expense.setSplitRatios(custom ? splitRatios : null);
        return sharedExpenseRepository.save(expense);
    }

    // Calculate balances — who owes whom, with names
    public List<Map<String, Object>> calculateBalances(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        int memberCount = members.size();
        if (memberCount == 0) return new ArrayList<>();

        Map<Long, BigDecimal> balances = new HashMap<>();
        for (GroupMember m : members) {
            balances.put(m.getUserId(), BigDecimal.ZERO);
        }

        for (SharedExpense expense : expenses) {
            if ("SETTLED".equals(expense.getDescription())) continue;
            if (expense.getAmount() == null) continue;

            // Payer is credited the full amount…
            balances.merge(expense.getPaidBy(), expense.getAmount(), BigDecimal::add);

            // …and every member (payer included) is debited their share:
            // percentage-based for CUSTOM splits, equal otherwise.
            for (GroupMember m : members) {
                BigDecimal share = shareFor(expense, m.getUserId(), memberCount);
                balances.merge(m.getUserId(), share.negate(), BigDecimal::add);
            }
        }

        List<Map<String, Object>> debts = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : balances.entrySet()) {
            if (entry.getValue().compareTo(BigDecimal.ZERO) != 0) {
                User u = findUser(entry.getKey());
                Map<String, Object> debt = new HashMap<>();
                debt.put("userId",     entry.getKey());
                debt.put("name",       u != null ? u.getName()       : "User #" + entry.getKey());
                debt.put("avatarData", u != null ? u.getAvatarData() : null);
                debt.put("avatarType", u != null ? u.getAvatarType() : null);
                debt.put("balance",    entry.getValue());
                debt.put("owes",       entry.getValue().compareTo(BigDecimal.ZERO) < 0);
                debts.add(debt);
            }
        }
        return debts;
    }

    // Settle up — optionally trigger MoMo payment, then clear expenses
    public Map<String, Object> settleUp(Long groupId, Long userId, String phoneNumber) {
        groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is not a member of this group");
        }

        String momoReferenceId = null;
        String momoStatus = null;

        // If a phone number is provided, fire the MoMo request first
        if (phoneNumber != null && !phoneNumber.isBlank()) {
            // Calculate total owed by this user
            List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
            List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);
            int memberCount = Math.max(members.size(), 1);

            java.math.BigDecimal owedAmount = java.math.BigDecimal.ZERO;
            for (SharedExpense se : expenses) {
                if ("SETTLED".equals(se.getDescription())) continue;
                if (se.getAmount() == null || se.getPaidBy() == null) continue;
                if (!se.getPaidBy().equals(userId)) {
                    // Respect custom split ratios when computing what this user owes
                    owedAmount = owedAmount.add(shareFor(se, userId, memberCount));
                }
            }

            if (owedAmount.compareTo(java.math.BigDecimal.ZERO) > 0) {
                try {
                    String refId = java.util.UUID.randomUUID().toString();
                    momoReferenceId = moMoService.requestToPay(
                            phoneNumber, owedAmount, "Tally group settle-up", refId);
                    momoStatus = "PENDING";
                } catch (Exception e) {
                    // Log but don't block settle-up in sandbox
                    System.err.println("MoMo request failed (sandbox): " + e.getMessage());
                    momoStatus = "FAILED";
                }
            }
        }

        // Always clear expenses (sandbox behaviour)
        List<SharedExpense> allExpenses = sharedExpenseRepository.findByGroupId(groupId);
        sharedExpenseRepository.deleteAll(allExpenses);

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Successfully settled up — all expenses cleared");
        result.put("userId",  userId);
        result.put("groupId", groupId);
        if (momoReferenceId != null) {
            result.put("momoReferenceId", momoReferenceId);
            result.put("momoStatus",      momoStatus);
        }
        return result;
    }

    // Overload for backward compatibility (no phone number)
    public Map<String, Object> settleUp(Long groupId, Long userId) {
        return settleUp(groupId, userId, null);
    }

    public void deleteGroup(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        groupMemberRepository.deleteAll(members);

        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);
        sharedExpenseRepository.deleteAll(expenses);

        groupRepository.deleteById(groupId);
    }
}
