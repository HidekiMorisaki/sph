ALTER TABLE public.employee_social_links
    DROP CONSTRAINT employee_social_links_platform_check;

ALTER TABLE public.employee_social_links
    ADD CONSTRAINT employee_social_links_platform_check
    CHECK (platform IN (
        'website', 'blog', 'github', 'linkedin', 'x', 'threads', 'bluesky', 'mastodon',
        'facebook', 'instagram', 'youtube', 'qiita', 'note'
    ));
