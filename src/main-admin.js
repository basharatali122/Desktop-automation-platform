const { shell, dialog, ipcMain } = require('electron');

class AdminManager {
    constructor() {
        this.adminPanelUrl = 'https://your-firebase-project.web.app/admin-panel';
    }

    // Open admin panel in default browser
    openAdminPanel(mainWindow) {
        // Show confirmation dialog
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Cancel', 'Open Admin Panel'],
            defaultId: 1,
            title: 'Admin Panel',
            message: 'Open Admin Panel in Browser?',
            detail: 'This will open the FireKirin admin panel in your default web browser.'
        }).then((result) => {
            if (result.response === 1) {
                shell.openExternal(this.adminPanelUrl);
                
                // Show success message
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Admin Panel',
                    message: 'Admin panel opened successfully!',
                    detail: 'You can now manage users and monitor system activity.'
                });
            }
        });
    }

    // Get admin panel URL (for UI display)
    getAdminPanelUrl() {
        return this.adminPanelUrl;
    }

    // Check if admin panel is accessible
    async checkAdminPanelAccess() {
        try {
            // Simple connectivity check
            const online = require('is-online');
            const isOnline = await online();
            return { accessible: isOnline, url: this.adminPanelUrl };
        } catch (error) {
            return { accessible: false, error: error.message };
        }
    }
}

module.exports = AdminManager;