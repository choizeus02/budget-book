import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CategoryGroup } from "../api/types";

interface CategoriesContextValue {
  categories: CategoryGroup[];
  iconOf: (name: string) => string;
  categoryMap: Record<string, string[]>;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: [],
  iconOf: () => "📌",
  categoryMap: {},
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  useEffect(() => {
    api.categories.list().then(setCategories);
  }, []);

  const iconOf = (name: string) =>
    categories.find((c) => c.name === name)?.icon ?? "📌";

  const categoryMap: Record<string, string[]> = Object.fromEntries(
    categories.map((c) => [c.name, c.subcategories])
  );

  return (
    <CategoriesContext.Provider value={{ categories, iconOf, categoryMap }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
