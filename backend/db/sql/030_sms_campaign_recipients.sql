CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
    id             CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    campaign_id    CHAR(36) NOT NULL,
    to_msisdn      VARCHAR(15) NOT NULL,
    name           VARCHAR(100) NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sms_campaign_recipients_campaign FOREIGN KEY (campaign_id)
        REFERENCES sms_campaigns(id) ON DELETE CASCADE,
    INDEX idx_sms_campaign_recipients_campaign (campaign_id)
);

ALTER TABLE sms_campaigns
ADD COLUMN is_explicit_list BOOLEAN NOT NULL DEFAULT FALSE AFTER status;
