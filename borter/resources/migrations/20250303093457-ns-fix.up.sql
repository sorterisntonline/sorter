-- Add Spotify namespace to relevant tags
UPDATE
    tags
SET
    ns = 'spotify'
WHERE
    id IN (62, 172, 3, 63, 197, 198, 189, 190, 191, 196, 210, 178, 298, 299, 276, 292, 295, 336, 335, 334, 337, 338, 339, 341, 342, 345, 346);
--;;

-- Add Linear namespace to relevant tag
UPDATE
    tags
SET
    ns = 'linear'
WHERE
    id = 120;
--;;

-- Add Discord namespace to relevant tags
UPDATE
    tags
SET
    ns = 'discord'
WHERE
    OWNER = 'discord';
--;;
