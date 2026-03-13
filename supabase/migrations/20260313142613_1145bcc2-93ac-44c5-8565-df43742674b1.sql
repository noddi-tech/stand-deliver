-- Fix corrupted Joachim mapping from bot rename
UPDATE github_user_mappings SET github_username = 'Jokkos1337' WHERE id = 'c145dfd6-3ce6-4e59-9161-cec68c29daa5' AND github_username = 'lovable-dev[bot]';
