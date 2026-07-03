import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { AuthUserHydrator } from "@/components/auth/auth-user-hydrator";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminReturnButton } from "@/components/admin/admin-return-button";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { getAuthSettings, listPublicUsers } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { countAllLibraryPrompts } from "@/lib/prompts/store";

export default async function AdminPage() {
    const currentUser = await getCurrentUser();
    if (!currentUser) redirect("/login?next=/admin");
    if (currentUser.role !== "admin") redirect("/");

    const [users, settings, promptCount] = await Promise.all([listPublicUsers(), getAuthSettings(), countAllLibraryPrompts()]);

    return (
        <AuthUserHydrator
            user={{
                id: currentUser.id,
                username: currentUser.username,
                email: currentUser.email,
                displayName: currentUser.displayName,
                role: currentUser.role,
                status: currentUser.status,
                quota: currentUser.quota,
                checkedInToday: currentUser.checkedInToday,
                lastCheckInDate: currentUser.lastCheckInDate,
            }}
        >
            <main className="h-dvh overflow-y-auto bg-stone-100 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
                <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95">
                    <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
                        <Link href="/" className="flex items-center gap-2.5 text-base font-semibold text-stone-950 dark:text-stone-100">
                            <span
                                className="size-8 bg-stone-950 dark:bg-white"
                                style={{
                                    mask: "url(/logo.svg) center / contain no-repeat",
                                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                }}
                            />
                            <span>管理后台</span>
                        </Link>
                        <UserStatusActions showConfig={false} />
                    </div>
                </header>

                <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:py-6">
                    <div className="mb-5 flex flex-col gap-4 rounded-lg border border-stone-200 bg-white px-4 py-4 shadow-sm shadow-stone-200/40 sm:px-5 md:flex-row md:items-center md:justify-between dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                                <LayoutDashboard className="size-5" />
                            </span>
                            <div className="min-w-0">
                                <h1 className="text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">管理员后台</h1>
                                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">管理注册开关、用户状态、额度规则和系统接口配置。</p>
                            </div>
                        </div>
                        <AdminReturnButton />
                    </div>
                    <AdminDashboard initialUsers={users} initialSettings={settings} initialPromptCount={promptCount} currentUser={currentUser} />
                </div>
            </main>
        </AuthUserHydrator>
    );
}
