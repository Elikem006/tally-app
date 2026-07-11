package user_service.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.AuthGuard;
import user_service.model.CustomCategory;
import user_service.service.CustomCategoryService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/categories")
@CrossOrigin(origins = "*")
public class CustomCategoryController {

    @Autowired
    private CustomCategoryService customCategoryService;

    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    /**
     * GET /api/categories/user/{userId}
     * Returns all custom categories for the given user.
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserCategories(@PathVariable Long userId) {
        try {
            List<CustomCategory> categories = customCategoryService.getUserCategories(userId);
            return ResponseEntity.ok(categories);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * POST /api/categories
     * Body: { "userId", "name", "emoji" }
     */
    @PostMapping
    public ResponseEntity<?> createCategory(@RequestBody Map<String, String> request,
                                            HttpServletRequest httpRequest) {
        try {
            String userIdStr = request.get("userId");
            String name      = request.get("name");
            String emoji     = request.get("emoji");

            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId is required", "success", false));
            }
            if (name == null || name.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "name is required", "success", false));
            }
            if (emoji == null || emoji.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "emoji is required", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);
            AuthGuard.requireSameUser(httpRequest, userId);
            CustomCategory saved = customCategoryService.createCategory(userId, name, emoji);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * DELETE /api/categories/{id}/user/{userId}
     */
    @DeleteMapping("/{id}/user/{userId}")
    public ResponseEntity<?> deleteCategory(
            @PathVariable Long id,
            @PathVariable Long userId) {
        try {
            customCategoryService.deleteCategory(id, userId);
            return ResponseEntity.ok(Map.of("message", "Category deleted", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
