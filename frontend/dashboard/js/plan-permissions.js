/**
 * Centralized Subscription Plan Feature Gating & Permissions System (Frontend)
 *
 * Tier Matrix:
 *  - Basic (₹1/mo): 3 Events, 500 Attendees, Email Templates Studio.
 *  - Standard (₹5/mo): 10 Events, 5000 Attendees, Email Templates Studio, Advanced Analytics & CSV Export.
 *  - Premium (₹10/mo): 50 Events, 25000 Attendees, Email Templates, Advanced Analytics, Dynamic Flyer Generations & VIP Features.
 */
(function () {
    const TIER_PERMISSIONS = {
        basic: {
            name: 'Basic (₹1/mo)',
            eventsLimit: 3,
            attendeesLimit: 500,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: false,
            csvExport: false,
            customDomain: false,
            apiAccess: false,
        },
        launchpad: {
            name: 'Basic (₹1/mo)',
            eventsLimit: 3,
            attendeesLimit: 500,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: false,
            csvExport: false,
            customDomain: false,
            apiAccess: false,
        },
        starter: {
            name: 'Basic (₹1/mo)',
            eventsLimit: 3,
            attendeesLimit: 500,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: false,
            csvExport: false,
            customDomain: false,
            apiAccess: false,
        },
        standard: {
            name: 'Standard (₹5/mo)',
            eventsLimit: 10,
            attendeesLimit: 5000,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: true,
            csvExport: true,
            customDomain: false,
            apiAccess: false,
        },
        scaleup: {
            name: 'Standard (₹5/mo)',
            eventsLimit: 10,
            attendeesLimit: 5000,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: true,
            csvExport: true,
            customDomain: false,
            apiAccess: false,
        },
        pro: {
            name: 'Standard (₹5/mo)',
            eventsLimit: 10,
            attendeesLimit: 5000,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: true,
            csvExport: true,
            customDomain: false,
            apiAccess: false,
        },
        premium: {
            name: 'Premium (₹10/mo)',
            eventsLimit: 50,
            attendeesLimit: 25000,
            aiFlyerGeneration: true,
            emailTemplatesCustomization: true,
            advancedAnalytics: true,
            csvExport: true,
            customDomain: true,
            apiAccess: true,
        },
        enterprise: {
            name: 'Premium (₹10/mo)',
            eventsLimit: 50,
            attendeesLimit: 25000,
            aiFlyerGeneration: true,
            emailTemplatesCustomization: true,
            advancedAnalytics: true,
            csvExport: true,
            customDomain: true,
            apiAccess: true,
        },
        trial: {
            name: 'Trial Mode',
            eventsLimit: 1,
            attendeesLimit: 100,
            aiFlyerGeneration: false,
            emailTemplatesCustomization: true,
            advancedAnalytics: false,
            csvExport: false,
            customDomain: false,
            apiAccess: false,
        }
    };

    const PlanPermissions = {
        /**
         * Get the current active plan name for the logged-in tenant
         */
        getCurrentPlan() {
            if (window.DashboardAuth && typeof window.DashboardAuth.getTenant === 'function') {
                const tenant = window.DashboardAuth.getTenant();
                if (tenant && tenant.subscription_plan) {
                    return tenant.subscription_plan.toLowerCase().trim();
                }
            }
            return 'basic';
        },

        /**
         * Get permissions object for the active or specified plan
         */
        getLimits(planName) {
            const plan = (planName || this.getCurrentPlan()).toLowerCase().trim();
            return TIER_PERMISSIONS[plan] || TIER_PERMISSIONS.basic;
        },

        /**
         * Check if a feature is allowed
         */
        can(feature, planName) {
            const limits = this.getLimits(planName);
            const val = limits[feature];
            if (typeof val === 'boolean') return val;
            if (typeof val === 'number') return val > 0;
            return false;
        },

        /**
         * Show standard upgrade modal prompt
         */
        showUpgradeModal(featureName, requiredPlan = 'ScaleUp Pro') {
            const featureLabels = {
                aiFlyerGeneration: 'AI Flyer Generation & Copywriting Engine',
                emailTemplatesCustomization: 'Custom HTML Email Template Studio',
                advancedAnalytics: 'Advanced Conversion Funnels & Export Analytics',
                csvExport: 'Attendee Database CSV & Excel Export',
                customDomain: 'White-label Custom Domain & SSL',
                apiAccess: 'Developer REST API Keys & Webhooks',
                eventsLimit: 'Unlimited Event Hosting'
            };

            const displayName = featureLabels[featureName] || featureName || 'This Premium Feature';

            // Remove existing modal if any
            const existing = document.getElementById('plan-upgrade-modal-overlay');
            if (existing) existing.remove();

            const modalHtml = `
                <div id="plan-upgrade-modal-overlay" style="position: fixed; inset: 0; background: rgba(2, 6, 23, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: modalFadeIn 0.25s ease-out forwards;">
                    <div style="background: linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(9, 13, 22, 0.98) 100%); border: 1.5px solid rgba(56, 189, 248, 0.35); border-radius: 20px; max-width: 520px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 35px rgba(56, 189, 248, 0.2); overflow: hidden; position: relative;">
                        <!-- Header Banner -->
                        <div style="background: linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%); padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: center; position: relative;">
                            <button id="close-upgrade-modal-btn" style="position: absolute; right: 16px; top: 16px; background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px;">&times;</button>
                            <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #38bdf8, #ec4899); margin-bottom: 12px; box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);">
                                <i data-lucide="sparkles" style="width: 28px; height: 28px; color: #fff;"></i>
                            </div>
                            <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 6px;">Unlock ${displayName}</h3>
                            <p style="font-size: 13.5px; color: #94a3b8; margin: 0;">Available on <strong>${requiredPlan}</strong> and higher tiers</p>
                        </div>
                        
                        <!-- Body Details -->
                        <div style="padding: 24px;">
                            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                                <h4 style="font-size: 13px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px;">What You Get in ${requiredPlan}:</h4>
                                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1; line-height: 1.8;">
                                    <li><strong>Unlimited / Multi-Event Hosting</strong> with instant public pages</li>
                                    <li><strong>AI Copywriting & Multi-Vibe Flyer Studio</strong></li>
                                    <li><strong>Attendee Sync & Real-time Database</strong></li>
                                    <li><strong>Custom HTML Email Templates</strong> & CSV Exports</li>
                                </ul>
                            </div>

                            <div style="display: flex; gap: 12px;">
                                <button id="cancel-upgrade-modal-btn" class="btn btn-outline" style="flex: 1; padding: 12px; border-radius: 10px; font-size: 13.5px; font-weight: 600;">Maybe Later</button>
                                <a href="/dashboard/subscription" class="btn btn-primary" style="flex: 2; padding: 12px; border-radius: 10px; font-size: 13.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; background: linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #ec4899 100%); box-shadow: 0 0 20px rgba(56, 189, 248, 0.35);">
                                    <span>Upgrade Plan Now</span>
                                    <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            if (window.lucide) window.lucide.createIcons({ node: document.getElementById('plan-upgrade-modal-overlay') });

            const overlay = document.getElementById('plan-upgrade-modal-overlay');
            document.getElementById('close-upgrade-modal-btn').onclick = () => overlay.remove();
            document.getElementById('cancel-upgrade-modal-btn').onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        }
    };

    window.PlanPermissions = PlanPermissions;
})();
