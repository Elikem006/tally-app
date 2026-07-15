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
import java.time.LocalDate;
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

    @Autowired
    private ExpenseService expenseService;

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
     * The userIds included in an expense's split. Uses the participant snapshot
     * taken at creation time when available, so members who joined the group
     * AFTER an expense was added are excluded from that expense. Legacy rows
     * (null snapshot) fall back to all current members.
     */
    private Set<Long> participantsOf(SharedExpense expense, List<GroupMember> members) {
        if (expense.getParticipantIds() != null && !expense.getParticipantIds().isBlank()) {
            Set<Long> ids = new HashSet<>();
            for (String s : expense.getParticipantIds().split(",")) {
                try {
                    ids.add(Long.parseLong(s.trim()));
                } catch (NumberFormatException ignored) {
                    // skip malformed token
                }
            }
            if (!ids.isEmpty()) return ids;
        }
        Set<Long> ids = new HashSet<>();
        for (GroupMember m : members) ids.add(m.getUserId());
        return ids;
    }

    /**
     * A member's share of an expense: zero if they were not a participant when
     * it was created; percentage-based for CUSTOM splits; otherwise an equal
     * share among the PARTICIPANTS (not the current member count). Falls back
     * to equal split if a stored ratio string can no longer be parsed.
     */
    private BigDecimal shareFor(SharedExpense expense, Long memberId, List<GroupMember> members) {
        Set<Long> participants = participantsOf(expense, members);
        if (!participants.contains(memberId)) return BigDecimal.ZERO;

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
                .divide(BigDecimal.valueOf(Math.max(participants.size(), 1)), 2, RoundingMode.HALF_UP);
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

    /**
     * Remove a member from a group. Only the group creator may remove members,
     * and the creator themselves can never be removed.
     */
    public void removeMember(Long groupId, Long userId, Long requestingUserId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        Long createdBy = group.getCreatedBy();

        // Only the creator can remove members (when the requester is known)
        if (requestingUserId != null && !requestingUserId.equals(createdBy)) {
            throw new RuntimeException("Only the group creator can remove members");
        }
        // The creator can never be removed from their own group
        if (userId.equals(createdBy)) {
            throw new RuntimeException("Cannot remove the group creator");
        }

        GroupMember target = groupMemberRepository.findByGroupId(groupId).stream()
                .filter(m -> m.getUserId().equals(userId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Member not found"));

        // Block removal while the member has an outstanding balance — otherwise
        // their debts (or credits) would silently vanish from the group.
        for (Map<String, Object> balance : calculateBalances(groupId)) {
            if (userId.equals(balance.get("userId"))) {
                BigDecimal b = (BigDecimal) balance.get("balance");
                if (b.abs().compareTo(new BigDecimal("0.01")) >= 0) {
                    throw new RuntimeException("Cannot remove member with outstanding balance of GHS "
                            + b.abs().setScale(2, RoundingMode.HALF_UP).toPlainString()
                            + ". They must settle up first.");
                }
            }
        }

        groupMemberRepository.delete(target);
    }

    // Get all groups for a user
    public List<Group> getUserGroups(Long userId) {
        return groupRepository.findGroupsByUserId(userId);
    }

    /**
     * Splitwise-style net position across ALL the user's groups:
     * how much they owe in total vs how much they are owed.
     */
    public Map<String, Object> getUserNetBalance(Long userId) {
        BigDecimal youOwe = BigDecimal.ZERO;
        BigDecimal youAreOwed = BigDecimal.ZERO;
        for (Group g : groupRepository.findGroupsByUserId(userId)) {
            for (Map<String, Object> balance : calculateBalances(g.getId())) {
                if (userId.equals(balance.get("userId"))) {
                    BigDecimal b = (BigDecimal) balance.get("balance");
                    if (b.signum() < 0) youOwe = youOwe.add(b.abs());
                    else youAreOwed = youAreOwed.add(b);
                }
            }
        }
        Map<String, Object> net = new HashMap<>();
        net.put("youOwe", youOwe.setScale(2, RoundingMode.HALF_UP));
        net.put("youAreOwed", youAreOwed.setScale(2, RoundingMode.HALF_UP));
        return net;
    }

    // Backward-compatible overload — no personalization
    public Map<String, Object> getGroupDetails(Long groupId) {
        return getGroupDetails(groupId, null);
    }

    // Get group details — members and expenses enriched with names.
    // When viewingUserId is provided, each expense also carries the viewer's
    // share (userShare), whether they paid (isPayer) and a displayAmount.
    public Map<String, Object> getGroupDetails(Long groupId, Long viewingUserId) {
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

        // Enrich expenses with paidByName + paidByAvatarData (+ per-viewer share)
        int memberCount = Math.max(members.size(), 1);
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
            entry.put("memberCount",     memberCount);

            entry.put("settled",         Boolean.TRUE.equals(se.getSettled()));
            entry.put("participantCount", participantsOf(se, members).size());

            // Personalized fields for the viewing user
            if (viewingUserId != null && se.getAmount() != null) {
                BigDecimal userShare = shareFor(se, viewingUserId, members);
                boolean isPayer = viewingUserId.equals(se.getPaidBy());
                entry.put("userShare",     userShare);
                entry.put("isPayer",       isPayer);
                entry.put("displayAmount", isPayer ? se.getAmount() : userShare);
            }
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
        // Sanitize description: strip HTML tags (XSS), trim, treat blank as null
        if (description != null) {
            description = description.replaceAll("<[^>]*>", "").trim();
            if (description.isEmpty()) description = null;
        }

        // Amount must be positive, reasonable, and normalized to 2 decimal places
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Amount must be greater than zero");
        }
        if (amount.compareTo(new BigDecimal("1000000")) > 0) {
            throw new RuntimeException("Amount looks too large — maximum is GHS 1,000,000");
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);

        // Snapshot of members present RIGHT NOW — later joiners are excluded
        List<GroupMember> currentMembers = groupMemberRepository.findByGroupId(groupId);
        if (currentMembers.isEmpty()) {
            throw new RuntimeException("Group has no members");
        }
        StringBuilder participantCsv = new StringBuilder();
        for (GroupMember m : currentMembers) {
            if (participantCsv.length() > 0) participantCsv.append(",");
            participantCsv.append(m.getUserId());
        }

        boolean custom = "CUSTOM".equalsIgnoreCase(splitType) && splitRatios != null && !splitRatios.isBlank();

        if (custom) {
            Map<Long, BigDecimal> ratios = parseSplitRatios(splitRatios);
            List<GroupMember> members = currentMembers;

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
            // Tolerance of 0.01 absorbs floating-point splits like 33.33+33.33+33.34
            if (sum.subtract(ONE_HUNDRED).abs().compareTo(new BigDecimal("0.01")) > 0) {
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
        expense.setParticipantIds(participantCsv.toString());
        expense.setSettled(false);
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
            // Settled expenses stay in history but no longer affect balances
            if (Boolean.TRUE.equals(expense.getSettled())) continue;
            if ("SETTLED".equals(expense.getDescription())) continue; // legacy marker
            if (expense.getAmount() == null) continue;

            // Payer is credited the full amount…
            balances.merge(expense.getPaidBy(), expense.getAmount(), BigDecimal::add);

            // …and every PARTICIPANT (payer included) is debited their share:
            // percentage-based for CUSTOM splits, equal among participants otherwise.
            // Members who joined after this expense was created owe nothing for it.
            for (GroupMember m : members) {
                BigDecimal share = shareFor(expense, m.getUserId(), members);
                if (share.compareTo(BigDecimal.ZERO) != 0) {
                    balances.merge(m.getUserId(), share.negate(), BigDecimal::add);
                }
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

    // Settle up — optionally trigger MoMo payment, then clear expenses.
    // Also records the settlement as an income-style expense for the group
    // creator (paymentMethod SETTLEMENT) so it appears in their history.
    public Map<String, Object> settleUp(Long groupId, Long userId, String phoneNumber) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is not a member of this group");
        }

        String momoReferenceId = null;
        String momoStatus = null;

        // Calculate total owed by the settling user across UNSETTLED expenses
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        BigDecimal owedAmount = BigDecimal.ZERO;
        for (SharedExpense se : expenses) {
            if (Boolean.TRUE.equals(se.getSettled())) continue;
            if ("SETTLED".equals(se.getDescription())) continue; // legacy marker
            if (se.getAmount() == null || se.getPaidBy() == null) continue;
            if (!se.getPaidBy().equals(userId)) {
                // Respect participant snapshot + custom split ratios
                owedAmount = owedAmount.add(shareFor(se, userId, members));
            }
        }

        // Nothing to settle — return early without touching any records
        if (owedAmount.compareTo(new BigDecimal("0.01")) < 0) {
            Map<String, Object> nothing = new HashMap<>();
            nothing.put("message", "No outstanding balance to settle.");
            nothing.put("userId",  userId);
            nothing.put("groupId", groupId);
            nothing.put("settledAmount", BigDecimal.ZERO);
            return nothing;
        }

        // Who is OWED money right now — needed to credit the settlement to the
        // correct member(s), proportionally to what each is owed.
        Map<Long, BigDecimal> owedTo = new HashMap<>();
        BigDecimal totalOwed = BigDecimal.ZERO;
        for (Map<String, Object> balance : calculateBalances(groupId)) {
            BigDecimal b = (BigDecimal) balance.get("balance");
            Long owedUserId = (Long) balance.get("userId");
            if (b.compareTo(BigDecimal.ZERO) > 0 && !owedUserId.equals(userId)) {
                owedTo.put(owedUserId, b);
                totalOwed = totalOwed.add(b);
            }
        }

        // If a phone number is provided, fire the MoMo request first
        if (phoneNumber != null && !phoneNumber.isBlank()) {
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

        // Mark expenses as settled — history is preserved, balances reset.
        // @Version on SharedExpense guards against concurrent settle-ups: a
        // simultaneous update throws OptimisticLockException and rolls back.
        for (SharedExpense se : expenses) {
            if (!Boolean.TRUE.equals(se.getSettled())) {
                se.setSettled(true);
            }
        }
        sharedExpenseRepository.saveAll(expenses);

        // Record settlement income for the member(s) who were owed money,
        // split proportionally to how much each was owed.
        String settlerName = resolveUserName(userId);
        if (totalOwed.compareTo(BigDecimal.ZERO) > 0) {
            for (Map.Entry<Long, BigDecimal> owed : owedTo.entrySet()) {
                BigDecimal portion = owedAmount
                        .multiply(owed.getValue())
                        .divide(totalOwed, 2, RoundingMode.HALF_UP);
                if (portion.compareTo(BigDecimal.ZERO) <= 0) continue;
                try {
                    expenseService.createExpense(
                            owed.getKey(),
                            portion,
                            "Settlement",
                            "Settlement received from " + settlerName + " in " + group.getName(),
                            LocalDate.now(),
                            "SETTLEMENT");
                } catch (Exception e) {
                    // Non-fatal — the settle-up itself succeeded
                    System.err.println("Failed to record settlement expense: " + e.getMessage());
                }
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Successfully settled up — expenses marked as settled");
        result.put("userId",  userId);
        result.put("groupId", groupId);
        result.put("settledAmount", owedAmount);
        result.put("settlerName",   settlerName);
        result.put("groupName",     group.getName());
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
