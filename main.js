const { Plugin, ItemView, WorkspaceLeaf, Modal, Notice, TFile } = require('obsidian');

const VIEW_TYPE = "task-master-view";
const FOLDER_PATH = "/_system/Tasks";

class TaskMasterView extends ItemView {
    constructor(leaf) { super(leaf); }
    getViewType() { return VIEW_TYPE; }
    getDisplayText() { return "Task Master"; }
    getIcon() { return "check-circle"; }

    async onOpen() { this.refresh(); }

    async refresh() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("tm-container");

        container.createDiv({ cls: "tm-header", text: "My Tasks" });
        const listEl = container.createDiv({ cls: "tm-list" });

        // Ensure folder
        if (!await this.app.vault.adapter.exists(FOLDER_PATH)) {
            await this.app.vault.createFolder(FOLDER_PATH);
        }

        const files = this.app.vault.getFiles().filter(f => f.path.startsWith(FOLDER_PATH));
        const tasks = await Promise.all(files.map(async f => {
            const cache = this.app.metadataCache.getFileCache(f);
            return { file: f, fm: cache?.frontmatter || {} };
        }));

        // Sort: Active first, then by Due Date
        tasks.sort((a, b) => {
            if (a.fm.completed !== b.fm.completed) return a.fm.completed ? 1 : -1;
            return new Date(a.fm.due || '9999') - new Date(b.fm.due || '9999');
        });

        tasks.forEach(task => {
            const card = listEl.createDiv({ cls: `tm-task-card ${task.fm.completed ? 'is-completed' : ''}` });
            
            const cb = card.createEl("input", { type: "checkbox", cls: "tm-checkbox" });
            cb.checked = task.fm.completed;
            cb.onclick = async (e) => {
                e.stopPropagation();
                await this.app.fileManager.processFrontMatter(task.file, fm => { fm.completed = cb.checked; });
                this.refresh();
            };

            const info = card.createDiv({ cls: "tm-info" });
            info.createEl("span", { cls: "tm-title", text: task.file.basename });
            
            const meta = info.createDiv({ cls: "tm-meta" });
            if (task.fm.priority) meta.createEl("span", { text: `🚩 ${task.fm.priority}` });
            if (task.fm.due) meta.createEl("span", { text: `📅 ${task.fm.due}` });
            if (task.fm.location) meta.createEl("span", { text: `📍 ${task.fm.location}` });

            card.onclick = () => new TaskFormModal(this.app, task, () => this.refresh()).open();
        });

        const fab = container.createDiv({ cls: "tm-fab", text: "+" });
        fab.onclick = () => new TaskFormModal(this.app, null, () => this.refresh()).open();
    }
}

class TaskFormModal extends Modal {
    constructor(app, task, onSave) {
        super(app);
        this.task = task;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        const fm = this.task?.fm || {};

        contentEl.createEl("h2", { text: this.task ? "Edit Task" : "New Task" });
        const grid = contentEl.createDiv({ cls: "tm-modal-grid" });

        const titleInp = grid.createEl("input", { cls: "tm-modal-full", type: "text", placeholder: "Task Name", value: this.task ? this.task.file.basename : "" });
        const descInp = grid.createEl("textarea", { cls: "tm-modal-full", placeholder: "Description & Sub-tasks..." });
        
        // Fetch content if editing
        if (this.task) {
            this.app.vault.read(this.task.file).then(c => descInp.value = c.split('---').pop().trim());
        }

        grid.createEl("label", { text: "Start Date" });
        const startInp = grid.createEl("input", { type: "date", value: fm.start || "" });

        grid.createEl("label", { text: "End Date" });
        const endInp = grid.createEl("input", { type: "date", value: fm.end || "" });

        grid.createEl("label", { text: "Due Date" });
        const dueInp = grid.createEl("input", { type: "date", value: fm.due || "" });

        grid.createEl("label", { text: "Priority" });
        const prioSel = grid.createEl("select");
        ["None", "Low", "Medium", "High"].forEach(p => {
            const o = prioSel.createEl("option", { text: p, value: p });
            if (fm.priority === p) o.selected = true;
        });

        grid.createEl("label", { text: "Location" });
        const locInp = grid.createEl("input", { type: "text", placeholder: "e.g. Office", value: fm.location || "" });

        const btnRow = contentEl.createDiv({ cls: "tm-modal-full", attr: { style: "margin-top: 20px; display: flex; gap: 10px;" } });
        const saveBtn = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
        
        saveBtn.onclick = async () => {
            const name = titleInp.value || "Untitled Task";
            const safeName = name.replace(/[\\/:*?"<>|]/g, '-');
            const path = `${FOLDER_PATH}/${safeName}.md`;
            const content = `---\ncompleted: ${fm.completed || false}\npriority: ${prioSel.value}\nstart: ${startInp.value}\nend: ${endInp.value}\ndue: ${dueInp.value}\nlocation: "${locInp.value}"\n---\n\n${descInp.value}`;

            if (this.task) {
                await this.app.vault.modify(this.task.file, content);
                if (this.task.file.basename !== safeName) await this.app.fileManager.renameFile(this.task.file, path);
            } else {
                await this.app.vault.create(path, content);
            }
            this.onSave();
            this.close();
        };

        if (this.task) {
            const delBtn = btnRow.createEl("button", { text: "Delete", cls: "mod-warning" });
            delBtn.onclick = async () => {
                await this.app.vault.delete(this.task.file);
                this.onSave();
                this.close();
            };
        }
    }
}

module.exports = class TaskMasterPlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE, (leaf) => new TaskMasterView(leaf));
        this.addRibbonIcon("check-circle", "Task Master", () => this.activateView());
    }

    async activateView() {
        let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE, active: true });
        }
        this.app.workspace.revealLeaf(leaf);
    }
};