import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';

/**
 * Fetch product categories with hierarchical structure for Purchase Invoice flow.
 * Returns categories organized by parent-child relationships.
 * Supports tree view rendering with expand/collapse.
 */
export function usePurchaseCategoriesHierarchy() {
  const { activeRestaurantId } = useTenant();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['product_categories_hierarchy', activeRestaurantId],
    queryFn: () =>
      base44.entities.ProductCategory.filter(
        activeRestaurantId ? { restaurant_id: activeRestaurantId, is_active: true } : { is_active: true },
        'sort_order',
        500
      ),
    enabled: !!activeRestaurantId,
    staleTime: 30000,
  });

  /**
   * Build tree structure from flat categories
   * Returns root categories with nested children
   */
  const buildTree = (cats) => {
    const roots = [];
    const childrenMap = {};

    // First pass: identify all children for each parent
    cats.forEach(cat => {
      if (cat.parent_id) {
        if (!childrenMap[cat.parent_id]) {
          childrenMap[cat.parent_id] = [];
        }
        childrenMap[cat.parent_id].push(cat);
      } else {
        roots.push(cat);
      }
    });

    // Recursive function to attach children to parents
    const attachChildren = (node) => {
      if (childrenMap[node.id]) {
        node.children = childrenMap[node.id]
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(child => attachChildren(child));
      } else {
        node.children = [];
      }
      return node;
    };

    return roots
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(root => attachChildren(root));
  };

  /**
   * Get all leaf categories (final level categories)
   * Useful for filtering products by leaf category only
   */
  const getLeafCategories = (cats = categories) => {
    const leaves = [];
    
    const traverse = (node) => {
      if (!node.children || node.children.length === 0) {
        leaves.push(node);
      } else {
        node.children.forEach(child => traverse(child));
      }
    };

    cats.forEach(cat => traverse(cat));
    return leaves;
  };

  /**
   * Get parent options for a given category
   * Excludes the category itself and its descendants
   */
  const getParentOptions = (categoryId) => {
    const descendants = new Set();
    
    const collectDescendants = (node) => {
      descendants.add(node.id);
      if (node.children) {
        node.children.forEach(child => collectDescendants(child));
      }
    };

    // Find the category and collect its descendants
    const findAndCollect = (cats) => {
      cats.forEach(cat => {
        if (cat.id === categoryId) {
          collectDescendants(cat);
        } else if (cat.children) {
          findAndCollect(cat.children);
        }
      });
    };

    const tree = buildTree(categories);
    findAndCollect(tree);

    // Return all categories except the category itself and its descendants
    return categories.filter(c => !descendants.has(c.id));
  };

  const tree = buildTree(categories);
  const leafCategories = getLeafCategories(tree);

  return {
    categories,
    tree,
    leafCategories,
    isLoading,
    buildTree,
    getLeafCategories,
    getParentOptions,
  };
}
