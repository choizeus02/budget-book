import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CategoryGroup } from "../api/types";

interface CategoriesContextValue {
  categories: CategoryGroup[];
  iconOf: (name: string) => string;
  categoryMap: Record<string, string[]>;
  refresh: () => void;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: [],
  iconOf: () => "📌",
  categoryMap: {},
  refresh: () => {},
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  const refresh = useCallback(() => {
    api.categories.list().then(setCategories);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const iconOf = (name: string) =>
    categories.find((c) => c.name === name)?.icon ?? "📌";

  const categoryMap: Record<string, string[]> = Object.fromEntries(
    categories.map((c) => [c.name, c.subcategories.map((s) => s.name)])
  );

  return (
    <CategoriesContext.Provider value={{ categories, iconOf, categoryMap, refresh }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
