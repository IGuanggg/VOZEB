"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Database, Gift, KeyRound, PlugZap, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, UserCog, UserRound, UsersRound } from "lucide-react";

import type { AuthSettings, PublicUser, SystemModelChannel, UserQuota, UserRole, UserStatus } from "@/lib/auth/store";
import type { Prompt } from "@/services/api/prompts";

type AdminDashboardProps = {
    initialUsers: PublicUser[];
    initialSettings: AuthSettings;
    initialPrompts: Prompt[];
    currentUser: PublicUser;
};

type PromptFormValue = {
    title: string;
    prompt: string;
    category?: string;
    tags?: string;
    coverUrl?: string;
    preview?: string;
};

type UserEditorValue = {
    role: UserRole;
    status: UserStatus;
    quota: UserQuota;
};

type AdminSectionKey = "overview" | "settings" | "users" | "prompts";

export function AdminDashboard({ initialUsers, initialSettings, initialPrompts, currentUser }: AdminDashboardProps) {
    const { message } = App.useApp();
    const [promptForm] = Form.useForm<PromptFormValue>();
    const [userForm] = Form.useForm<UserEditorValue>();
    const [users, setUsers] = useState(initialUsers);
    const [settings, setSettings] = useState(initialSettings);
    const [prompts, setPrompts] = useState(initialPrompts);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [fetchingModelId, setFetchingModelId] = useState("");
    const [promptSaving, setPromptSaving] = useState(false);
    const [deletingPromptId, setDeletingPromptId] = useState("");
    const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
    const [activeSection, setActiveSection] = useState<AdminSectionKey>("overview");
    const stats = useMemo(
        () => ({
            total: users.length,
            active: users.filter((user) => user.status === "active").length,
            admins: users.filter((user) => user.role === "admin").length,
            disabled: users.filter((user) => user.status === "disabled").length,
        }),
        [users],
    );
    const settingsSummary = useMemo(
        () => ({
            totalChannels: settings.systemChannels.length,
            enabledChannels: settings.systemChannels.filter((channel) => channel.enabled).length,
            models: uniqueList(settings.systemChannels.flatMap((channel) => channel.models)).length,
        }),
        [settings.systemChannels],
    );

    const saveSettings = async (patch: Partial<AuthSettings>, successText = "设置已保存") => {
        setSettingsLoading(true);
        try {
            const response = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const payload = (await response.json()) as { settings?: AuthSettings; error?: string };
            if (!response.ok || !payload.settings) throw new Error(payload.error || "更新设置失败");
            setSettings(payload.settings);
            message.success(successText);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新设置失败");
        } finally {
            setSettingsLoading(false);
        }
    };

    const updateUser = async (userId: string, patch: Partial<Pick<PublicUser, "role" | "status" | "quota">>) => {
        setUpdatingUserId(userId);
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const payload = (await response.json()) as { user?: PublicUser; error?: string };
            if (!response.ok || !payload.user) throw new Error(payload.error || "更新用户失败");
            setUsers((items) => items.map((item) => (item.id === userId ? payload.user! : item)));
            message.success("用户已更新");
            return payload.user;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新用户失败");
            return null;
        } finally {
            setUpdatingUserId(null);
        }
    };

    const createPrompt = async (value: PromptFormValue) => {
        setPromptSaving(true);
        try {
            const response = await fetch("/api/admin/prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...value, tags: splitTags(value.tags) }),
            });
            const payload = (await response.json()) as { prompt?: Prompt; error?: string };
            if (!response.ok || !payload.prompt) throw new Error(payload.error || "新增提示词失败");
            setPrompts((items) => [payload.prompt!, ...items]);
            promptForm.resetFields();
            message.success("公共提示词已新增");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "新增提示词失败");
        } finally {
            setPromptSaving(false);
        }
    };

    const deletePrompt = async (id: string) => {
        setDeletingPromptId(id);
        try {
            const response = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "删除提示词失败");
            setPrompts((items) => items.filter((item) => item.id !== id));
            message.success("公共提示词已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除提示词失败");
        } finally {
            setDeletingPromptId("");
        }
    };

    const updateChannel = (id: string, patch: Partial<SystemModelChannel>) => {
        setSettings((current) => ({
            ...current,
            systemChannels: current.systemChannels.map((channel) => (channel.id === id ? { ...channel, ...patch, apiFormat: "openai", models: patch.models ? uniqueList(patch.models) : channel.models } : channel)),
        }));
    };

    const addChannel = () => {
        setSettings((current) => ({ ...current, systemChannels: [...current.systemChannels, createSystemChannel()] }));
    };

    const deleteChannel = (id: string) => {
        setSettings((current) => ({ ...current, systemChannels: current.systemChannels.filter((channel) => channel.id !== id) }));
    };

    const updateDefaultQuota = (key: keyof UserQuota, value: number | null) => {
        setSettings((current) => ({ ...current, defaultQuota: { ...current.defaultQuota, [key]: Number(value) || 0 } }));
    };

    const updateCheckInReward = (key: keyof UserQuota, value: number | null) => {
        setSettings((current) => ({ ...current, checkInReward: { ...current.checkInReward, [key]: Number(value) || 0 } }));
    };

    const fetchModelsForChannel = async (channel: SystemModelChannel) => {
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) {
            message.error("请先填写该渠道的 Base URL 和 API Key");
            return;
        }
        setFetchingModelId(channel.id);
        try {
            const models = await requestAdminModels(channel);
            updateChannel(channel.id, { models });
            message.success(`${channel.name || "渠道"} 已拉取 ${models.length} 个模型`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "拉取模型失败");
        } finally {
            setFetchingModelId("");
        }
    };

    const fetchAllModels = async () => {
        const runnable = settings.systemChannels.filter((channel) => channel.baseUrl.trim() && channel.apiKey.trim());
        if (!runnable.length) {
            message.error("请先填写至少一个渠道的 Base URL 和 API Key");
            return;
        }
        setFetchingModelId("all");
        try {
            const entries = await Promise.all(runnable.map(async (channel) => [channel.id, await requestAdminModels(channel)] as const));
            const modelMap = new Map(entries);
            setSettings((current) => ({
                ...current,
                systemChannels: current.systemChannels.map((channel) => (modelMap.has(channel.id) ? { ...channel, models: modelMap.get(channel.id) || [] } : channel)),
            }));
            message.success("模型列表已拉取");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "拉取模型失败");
        } finally {
            setFetchingModelId("");
        }
    };

    const openUserEditor = (user: PublicUser) => {
        setEditingUser(user);
        userForm.setFieldsValue({ role: user.role, status: user.status, quota: user.quota });
    };

    const closeUserEditor = () => {
        setEditingUser(null);
        userForm.resetFields();
    };

    const saveUserEditor = async (value: UserEditorValue) => {
        if (!editingUser) return;
        const user = await updateUser(editingUser.id, {
            role: value.role,
            status: value.status,
            quota: normalizeQuotaFormValue(value.quota, editingUser.quota),
        });
        if (user) closeUserEditor();
    };

    const userColumns: TableColumnsType<PublicUser> = [
        {
            title: "用户",
            dataIndex: "displayName",
            render: (_, record) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium text-stone-950 dark:text-stone-100">
                        <UserRound className="size-4 text-stone-400" />
                        <span className="truncate">{record.displayName}</span>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">@{record.username}</div>
                </div>
            ),
        },
        {
            title: "角色",
            dataIndex: "role",
            width: 120,
            render: (role: UserRole) => <Tag color={role === "admin" ? "blue" : "default"}>{role === "admin" ? "管理员" : "普通用户"}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 120,
            render: (status: UserStatus) => <Tag color={status === "active" ? "green" : "red"}>{status === "active" ? "可用" : "已禁用"}</Tag>,
        },
        {
            title: "每日额度",
            dataIndex: "quota",
            width: 360,
            render: (quota: UserQuota) => <QuotaSummary quota={quota} />,
        },
        {
            title: "操作",
            width: 120,
            render: (_, record) => (
                <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} loading={updatingUserId === record.id} onClick={() => openUserEditor(record)}>
                    管理
                </Button>
            ),
        },
    ];

    const promptColumns: TableColumnsType<Prompt> = [
        {
            title: "提示词",
            dataIndex: "title",
            render: (_, record) => (
                <div className="flex min-w-0 gap-3">
                    {record.coverUrl ? (
                        <img src={record.coverUrl} alt={record.title} className="h-14 w-20 shrink-0 rounded-md border border-stone-200 object-cover dark:border-stone-800" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                        <div className="h-14 w-20 shrink-0 rounded-md border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900" />
                    )}
                    <div className="min-w-0">
                        <div className="font-medium text-stone-950 dark:text-stone-100">{record.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{record.prompt}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {record.tags.map((tag) => (
                                <Tag key={tag} className="m-0 text-[11px]">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    </div>
                </div>
            ),
        },
        { title: "分类", dataIndex: "category", width: 140 },
        {
            title: "操作",
            width: 90,
            render: (_, record) => (
                <Popconfirm title="删除公共提示词？" okText="删除" cancelText="取消" onConfirm={() => deletePrompt(record.id)}>
                    <Button size="small" danger loading={deletingPromptId === record.id} icon={<Trash2 className="size-3.5" />} />
                </Popconfirm>
            ),
        },
    ];
    const activeSectionInfo = adminSections.find((section) => section.key === activeSection) || adminSections[0];

    return (
        <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
            <AdminSectionNav activeKey={activeSection} onChange={setActiveSection} />
            <div className="min-w-0 space-y-5">
                <div className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100">
                        {activeSectionInfo.icon}
                        <span>{activeSectionInfo.label}</span>
                    </div>
                    <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">{activeSectionInfo.description}</p>
                </div>

                {activeSection === "overview" ? (
                    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        <Metric label="用户总数" value={stats.total} detail={`${stats.active} 个可用账号`} icon={<UsersRound className="size-5" />} tone="slate" />
                        <Metric label="管理员" value={stats.admins} detail={`${stats.disabled} 个账号禁用`} icon={<ShieldCheck className="size-5" />} tone="blue" />
                        <Metric label="通用接口" value={settingsSummary.enabledChannels} detail={`共 ${settingsSummary.totalChannels} 个渠道`} icon={<PlugZap className="size-5" />} tone="emerald" />
                        <Metric label="公共提示词" value={prompts.length} detail={`${settingsSummary.models} 个模型已录入`} icon={<KeyRound className="size-5" />} tone="amber" />
                    </section>
                ) : null}

                {activeSection === "settings" ? (
                    <Panel>
                        <PanelHeader
                            title="系统设置"
                            description="账号、额度和系统接口分区管理。"
                            actions={
                                <div className="flex flex-wrap gap-2 text-xs text-stone-500 dark:text-stone-400">
                                    <Tag className="m-0">
                                        接口 {settingsSummary.enabledChannels}/{settingsSummary.totalChannels}
                                    </Tag>
                                    <Tag className="m-0">模型 {settingsSummary.models}</Tag>
                                    <Tag className="m-0">{settings.registrationEnabled ? "注册开放" : "注册关闭"}</Tag>
                                </div>
                            }
                        />
                        <div className="space-y-5 p-4 sm:p-5">
                            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.66fr)_minmax(0,1.34fr)]">
                                <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/40">
                                    <SectionTitle icon={<UserCog className="size-4" />} title="账号策略" />
                                    <div className="mt-4 space-y-4">
                                        <SettingToggle
                                            title="开放注册"
                                            description="关闭后，新账号不能自助注册。"
                                            checked={settings.registrationEnabled}
                                            checkedChildren="开放"
                                            unCheckedChildren="关闭"
                                            onChange={(registrationEnabled) => setSettings((current) => ({ ...current, registrationEnabled }))}
                                        />
                                    </div>
                                </div>
                                <QuotaRuleTable defaultQuota={settings.defaultQuota} checkInReward={settings.checkInReward} onDefaultQuotaChange={updateDefaultQuota} onCheckInRewardChange={updateCheckInReward} />
                            </div>
                            <div className="flex justify-end border-b border-stone-200 pb-5 dark:border-stone-800">
                                <Button
                                    type="primary"
                                    loading={settingsLoading}
                                    icon={<Save className="size-4" />}
                                    onClick={() => saveSettings({ registrationEnabled: settings.registrationEnabled, defaultQuota: settings.defaultQuota, checkInReward: settings.checkInReward }, "账号与额度设置已保存")}
                                >
                                    保存账号与额度
                                </Button>
                            </div>

                            <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3 xl:flex-row xl:items-center xl:justify-between dark:border-stone-800 dark:bg-stone-900/40">
                                <SettingInlineToggle
                                    title="允许用户自配接口"
                                    checked={settings.allowUserApiConfig}
                                    checkedChildren="允许"
                                    unCheckedChildren="禁止"
                                    onChange={(allowUserApiConfig) => setSettings((current) => ({ ...current, allowUserApiConfig }))}
                                />
                                <Space wrap className="justify-end">
                                    <Button icon={<RefreshCw className="size-4" />} loading={fetchingModelId === "all"} onClick={() => void fetchAllModels()}>
                                        拉取全部模型
                                    </Button>
                                    <Button icon={<Plus className="size-4" />} onClick={addChannel}>
                                        新增渠道
                                    </Button>
                                    <Button
                                        type="primary"
                                        loading={settingsLoading}
                                        icon={<Save className="size-4" />}
                                        onClick={() => saveSettings({ systemChannels: settings.systemChannels, defaultModels: settings.defaultModels, allowUserApiConfig: settings.allowUserApiConfig }, "通用接口已保存")}
                                    >
                                        保存接口设置
                                    </Button>
                                </Space>
                            </div>
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                                <div className="space-y-3">
                                    {settings.systemChannels.map((channel) => (
                                        <SystemChannelEditor
                                            key={channel.id}
                                            channel={channel}
                                            fetching={fetchingModelId === channel.id}
                                            onChange={(patch) => updateChannel(channel.id, patch)}
                                            onDelete={() => deleteChannel(channel.id)}
                                            onFetchModels={() => void fetchModelsForChannel(channel)}
                                        />
                                    ))}
                                    {!settings.systemChannels.length ? (
                                        <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/70 p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900/30 dark:text-stone-400">还没有通用接口。</div>
                                    ) : null}
                                </div>
                                <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/40">
                                    <SectionTitle icon={<Database className="size-4" />} title="默认模型" />
                                    <div className="mt-4 space-y-3">
                                        {defaultModelKeys.map((item) => (
                                            <LabeledControl key={item.key} label={item.label}>
                                                <Input
                                                    value={settings.defaultModels[item.key]}
                                                    placeholder="模型名"
                                                    onChange={(event) => setSettings((current) => ({ ...current, defaultModels: { ...current.defaultModels, [item.key]: event.target.value } }))}
                                                />
                                            </LabeledControl>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Panel>
                ) : null}

                {activeSection === "users" ? (
                    <Panel>
                        <PanelHeader
                            title="用户管理"
                            description="调整角色、账号状态和每日额度。"
                            actions={
                                <Button href="/register" icon={<Plus className="size-4" />}>
                                    新增用户
                                </Button>
                            }
                        />
                        <Table rowKey="id" columns={userColumns} dataSource={users} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 1040 }} size="middle" />
                    </Panel>
                ) : null}

                {activeSection === "prompts" ? (
                    <Panel>
                        <PanelHeader title="公共提示词库" description="这里新增的提示词会出现在用户端“提示词库”；旧的外部仓库提示词已不再加载。" />
                        <div className="grid gap-5 p-4 lg:grid-cols-[400px_minmax(0,1fr)] sm:p-5">
                            <Form className="rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/40" form={promptForm} layout="vertical" requiredMark={false} onFinish={createPrompt}>
                                <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item label="分类" name="category">
                                    <Input placeholder="例如：商业海报" />
                                </Form.Item>
                                <Form.Item label="标签" name="tags">
                                    <Input placeholder="用逗号分隔" />
                                </Form.Item>
                                <Form.Item label="封面 URL" name="coverUrl">
                                    <Input placeholder="可选" />
                                </Form.Item>
                                <Form.Item label="提示词内容" name="prompt" rules={[{ required: true, message: "请输入提示词内容" }]}>
                                    <Input.TextArea rows={5} />
                                </Form.Item>
                                <Form.Item label="备注 / 预览" name="preview">
                                    <Input.TextArea rows={2} />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" loading={promptSaving} icon={<Plus className="size-4" />}>
                                    插入公共提示词
                                </Button>
                            </Form>
                            <Table rowKey="id" columns={promptColumns} dataSource={prompts} pagination={{ pageSize: 6, hideOnSinglePage: true }} size="middle" />
                        </div>
                    </Panel>
                ) : null}
            </div>

            <Modal
                title={editingUser ? `用户管理：${editingUser.displayName}` : "用户管理"}
                open={Boolean(editingUser)}
                okText="保存"
                cancelText="取消"
                confirmLoading={Boolean(editingUser && updatingUserId === editingUser.id)}
                onOk={() => userForm.submit()}
                onCancel={closeUserEditor}
            >
                <Form form={userForm} layout="vertical" requiredMark={false} onFinish={saveUserEditor}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
                            <Select
                                options={[
                                    { value: "user", label: "普通用户" },
                                    { value: "admin", label: "管理员" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item label="账号状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
                            <Select
                                disabled={editingUser?.id === currentUser.id}
                                options={[
                                    { value: "active", label: "可用" },
                                    { value: "disabled", label: "禁用" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    <div className="mb-3 text-sm font-semibold text-stone-950 dark:text-stone-100">每日额度</div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {quotaKeys.map((item) => (
                            <Form.Item key={item.key} label={item.label} name={["quota", item.key]} rules={[{ required: true, message: "请输入额度" }]}>
                                <InputNumber className="w-full" min={0} precision={0} />
                            </Form.Item>
                        ))}
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

function Panel({ children }: { children: ReactNode }) {
    return <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">{children}</section>;
}

function AdminSectionNav({ activeKey, onChange }: { activeKey: AdminSectionKey; onChange: (key: AdminSectionKey) => void }) {
    return (
        <aside className="xl:sticky xl:top-20 xl:self-start">
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-2 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
                <div className="flex gap-2 xl:flex-col">
                    {adminSections.map((section) => {
                        const active = section.key === activeKey;
                        return (
                            <button
                                key={section.key}
                                type="button"
                                className={`flex min-w-36 items-center gap-3 rounded-md px-3 py-3 text-left transition xl:min-w-0 ${
                                    active
                                        ? "bg-stone-950 text-white shadow-sm dark:bg-stone-900 dark:text-stone-100 dark:ring-1 dark:ring-stone-700"
                                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-white"
                                }`}
                                onClick={() => onChange(section.key)}
                            >
                                <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-white/15 dark:bg-stone-800" : "bg-stone-100 dark:bg-stone-900"}`}>{section.icon}</span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">{section.label}</span>
                                    <span className={`mt-0.5 block truncate text-xs ${active ? "text-white/70 dark:text-stone-400" : "text-stone-500 dark:text-stone-500"}`}>{section.shortDescription}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}

function PanelHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between dark:border-stone-800">
            <div className="min-w-0">
                <h2 className="text-base font-semibold text-stone-950 dark:text-stone-100">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
    );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100">
            <span className="flex size-7 items-center justify-center rounded-md bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-stone-950 dark:text-stone-200 dark:ring-stone-800">{icon}</span>
            <span>{title}</span>
        </div>
    );
}

function SettingToggle({ title, description, checked, checkedChildren, unCheckedChildren, onChange }: { title: string; description: string; checked: boolean; checkedChildren: string; unCheckedChildren: string; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium text-stone-950 dark:text-stone-100">{title}</div>
                <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
            </div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}

function SettingInlineToggle({ title, checked, checkedChildren, unCheckedChildren, onChange }: { title: string; checked: boolean; checkedChildren: string; unCheckedChildren: string; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex w-full items-center justify-between gap-4 rounded-md bg-white px-4 py-2.5 ring-1 ring-stone-200 xl:w-auto dark:bg-stone-950 dark:ring-stone-800">
            <div className="text-sm font-medium text-stone-950 dark:text-stone-100">{title}</div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}

function QuotaRuleTable({
    defaultQuota,
    checkInReward,
    onDefaultQuotaChange,
    onCheckInRewardChange,
}: {
    defaultQuota: UserQuota;
    checkInReward: UserQuota;
    onDefaultQuotaChange: (key: keyof UserQuota, value: number | null) => void;
    onCheckInRewardChange: (key: keyof UserQuota, value: number | null) => void;
}) {
    return (
        <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/40">
            <SectionTitle icon={<Gift className="size-4" />} title="额度规则" />
            <div className="mt-4 overflow-x-auto">
                <div className="min-w-[540px]">
                    <div className="grid grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-stone-200 pb-2 text-xs font-medium text-stone-500 dark:border-stone-800 dark:text-stone-400">
                        <div>类型</div>
                        <div>新用户默认额度</div>
                        <div>每日签到奖励</div>
                    </div>
                    <div className="divide-y divide-stone-200 dark:divide-stone-800">
                        {quotaKeys.map((item) => (
                            <div key={item.key} className="grid grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-3">
                                <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{item.label}</div>
                                <InputNumber className="w-full" min={0} precision={0} value={defaultQuota[item.key]} onChange={(value) => onDefaultQuotaChange(item.key, toNumberOrZero(value))} />
                                <InputNumber className="w-full" min={0} precision={0} value={checkInReward[item.key]} onChange={(value) => onCheckInRewardChange(item.key, toNumberOrZero(value))} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SystemChannelEditor({ channel, fetching, onChange, onDelete, onFetchModels }: { channel: SystemModelChannel; fetching: boolean; onChange: (patch: Partial<SystemModelChannel>) => void; onDelete: () => void; onFetchModels: () => void }) {
    return (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100">
                            <PlugZap className="size-4 text-stone-400" />
                            <span className="truncate">{channel.name || "未命名渠道"}</span>
                        </div>
                        <Tag color={channel.enabled ? "green" : "default"} className="m-0">
                            {channel.enabled ? "启用" : "停用"}
                        </Tag>
                        <Tag className="m-0">{channel.models.length} 个模型</Tag>
                    </div>
                    <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{channel.baseUrl || "未填写 Base URL"}</div>
                </div>
                <Space wrap>
                    <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={fetching} onClick={onFetchModels}>
                        拉取模型
                    </Button>
                    <Switch checkedChildren="启用" unCheckedChildren="停用" checked={channel.enabled} onChange={(enabled) => onChange({ enabled })} />
                    <Popconfirm title="删除这个接口渠道？" okText="删除" cancelText="取消" onConfirm={onDelete}>
                        <Button size="small" danger icon={<Trash2 className="size-3.5" />} aria-label="删除渠道" title="删除渠道" />
                    </Popconfirm>
                </Space>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_minmax(220px,0.8fr)]">
                <LabeledControl label="渠道名称">
                    <Input value={channel.name} placeholder="默认渠道" onChange={(event) => onChange({ name: event.target.value })} />
                </LabeledControl>
                <LabeledControl label="Base URL">
                    <Input value={channel.baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => onChange({ baseUrl: event.target.value })} />
                </LabeledControl>
                <LabeledControl label="API Key">
                    <Input.Password value={channel.apiKey} placeholder="sk-..." onChange={(event) => onChange({ apiKey: event.target.value })} />
                </LabeledControl>
                <div className="lg:col-span-3">
                    <LabeledControl label="模型列表">
                        <Select className="w-full" mode="tags" maxTagCount="responsive" value={channel.models} placeholder="输入或拉取模型名" onChange={(models) => onChange({ models })} />
                    </LabeledControl>
                </div>
            </div>
        </div>
    );
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
            {children}
        </label>
    );
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: ReactNode; tone: "slate" | "blue" | "emerald" | "amber" }) {
    const toneClass = metricToneClass[tone];
    return (
        <div className="flex min-h-28 items-center justify-between rounded-lg border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
            <div className="min-w-0">
                <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{label}</p>
                <p className="mt-2 text-3xl font-semibold leading-none text-stone-950 dark:text-stone-100">{value}</p>
                <p className="mt-2 truncate text-xs text-stone-500 dark:text-stone-400">{detail}</p>
            </div>
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
        </div>
    );
}

function QuotaSummary({ quota }: { quota: UserQuota }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {quotaKeys.map((item) => (
                <Tag key={item.key} className="m-0 text-[11px]">
                    {item.shortLabel} {quota[item.key]}
                </Tag>
            ))}
        </div>
    );
}

function createSystemChannel(): SystemModelChannel {
    return { id: crypto.randomUUID(), name: "默认渠道", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: true };
}

async function requestAdminModels(channel: SystemModelChannel) {
    const response = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: channel.baseUrl, apiKey: channel.apiKey }),
    });
    const payload = (await response.json()) as { models?: string[]; error?: string };
    if (!response.ok || !payload.models) throw new Error(payload.error || "拉取模型失败");
    return payload.models;
}

function splitTags(value?: string) {
    return (value || "")
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function uniqueList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeQuotaFormValue(value: Partial<UserQuota> | undefined, fallback: UserQuota): UserQuota {
    return {
        imageDaily: normalizeQuotaNumber(value?.imageDaily, fallback.imageDaily),
        videoDaily: normalizeQuotaNumber(value?.videoDaily, fallback.videoDaily),
        textDaily: normalizeQuotaNumber(value?.textDaily, fallback.textDaily),
        audioDaily: normalizeQuotaNumber(value?.audioDaily, fallback.audioDaily),
    };
}

function normalizeQuotaNumber(value: unknown, fallback: number) {
    const numberValue = Math.floor(Number(value));
    return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function toNumberOrZero(value: unknown) {
    const numberValue = Math.floor(Number(value));
    return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

const quotaKeys: Array<{ key: keyof UserQuota; label: string; shortLabel: string }> = [
    { key: "imageDaily", label: "图片额度", shortLabel: "图" },
    { key: "videoDaily", label: "视频额度", shortLabel: "视频" },
    { key: "textDaily", label: "文本额度", shortLabel: "文" },
    { key: "audioDaily", label: "音频额度", shortLabel: "音频" },
];

const defaultModelKeys = [
    { key: "imageModel", label: "生图" },
    { key: "videoModel", label: "视频" },
    { key: "textModel", label: "文本" },
    { key: "audioModel", label: "音频" },
] as const;

const adminSections: Array<{ key: AdminSectionKey; label: string; description: string; shortDescription: string; icon: ReactNode }> = [
    { key: "overview", label: "概览", description: "快速查看用户、接口、模型和公共提示词状态。", shortDescription: "关键数据", icon: <Database className="size-4" /> },
    { key: "settings", label: "系统设置", description: "管理注册策略、签到额度、通用接口和默认模型。", shortDescription: "账号与接口", icon: <SlidersHorizontal className="size-4" /> },
    { key: "users", label: "用户管理", description: "调整用户角色、账号状态和每日额度。", shortDescription: "角色额度", icon: <UsersRound className="size-4" /> },
    { key: "prompts", label: "提示词库", description: "维护会出现在用户端提示词库里的公共提示词。", shortDescription: "公共内容", icon: <KeyRound className="size-4" /> },
];

const metricToneClass = {
    slate: "bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
};
