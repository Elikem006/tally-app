package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.CustomCategory;
import user_service.repository.CustomCategoryRepository;
import user_service.repository.ExpenseRepository;

import java.util.List;
import java.util.Set;

@Service
public class CustomCategoryService {

    private static final Set<String> DEFAULT_CATEGORIES = Set.of(
            "Food", "Transport", "Entertainment", "Utilities", "Other"
    );

    @Autowired
    private CustomCategoryRepository customCategoryRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

    public List<CustomCategory> getUserCategories(Long userId) {
        return customCategoryRepository.findByUserId(userId);
    }

    public CustomCategory createCategory(Long userId, String name, String emoji) {
        if (name == null || name.isBlank()) {
            throw new RuntimeException("Category name cannot be empty");
        }
        if (emoji == null || emoji.isBlank()) {
            throw new RuntimeException("Emoji cannot be empty");
        }

        String trimmedName = name.trim();

        if (trimmedName.length() > 30) {
            throw new RuntimeException("Category name cannot be longer than 30 characters");
        }

        // Block shadowing the built-in categories
        if (DEFAULT_CATEGORIES.stream().anyMatch(d -> d.equalsIgnoreCase(trimmedName))) {
            throw new RuntimeException("\"" + trimmedName + "\" is a default category and cannot be duplicated");
        }

        // Block duplicates within this user's custom categories
        if (customCategoryRepository.existsByUserIdAndNameIgnoreCase(userId, trimmedName)) {
            throw new RuntimeException("You already have a category named \"" + trimmedName + "\"");
        }

        CustomCategory cat = new CustomCategory();
        cat.setUserId(userId);
        cat.setName(trimmedName);
        cat.setEmoji(emoji.trim());
        return customCategoryRepository.save(cat);
    }

    public void deleteCategory(Long id, Long userId) {
        CustomCategory cat = customCategoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found"));

        // Verify ownership before deleting
        if (!cat.getUserId().equals(userId)) {
            throw new RuntimeException("Category not found");
        }

        // Block deletion while expenses still reference this category —
        // otherwise those expenses would point at a name that no longer exists.
        long inUse = expenseRepository.countByUserIdAndCategory(userId, cat.getName());
        if (inUse > 0) {
            throw new RuntimeException("Cannot delete category '" + cat.getName() + "' — it has "
                    + inUse + " expense" + (inUse == 1 ? "" : "s")
                    + ". Update or delete those expenses first.");
        }

        customCategoryRepository.deleteByIdAndUserId(id, userId);
    }
}
