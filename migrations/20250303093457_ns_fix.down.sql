-- Remove Spotify namespace from Spotify tags
UPDATE
    tags
SET
    ns = NULL
WHERE
    id IN (62, 172, 3, 63, 197, 198, 189, 190, 191, 196, 210, 178, 298, 299, 276, 292, 295, 336, 335, 334, 337, 338, 339, 341, 342, 345, 346);
--;;

-- Remove Linear namespace from Linear tag
UPDATE
    tags
SET
    ns = NULL
WHERE
    id = 120;
--;;

-- Remove Discord namespace from Discord tags
UPDATE
    tags
SET
    ns = NULL
WHERE
    OWNER = 'discord';
--;;
