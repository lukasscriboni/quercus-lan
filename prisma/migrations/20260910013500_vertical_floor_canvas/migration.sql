-- Unifica el editor y la vista operativa sobre un lienzo vertical de 700 x 1000.
-- Se conserva el tamaño de cada objeto y se traslada su centro proporcionalmente.
UPDATE "DiningTable"
SET
  "x" = LEAST(700 - LEAST("width", 700), GREATEST(0, (("x" + "width" / 2) * 700 / 1100) - LEAST("width", 700) / 2)),
  "y" = LEAST(1000 - LEAST("height", 1000), GREATEST(0, (("y" + "height" / 2) * 1000 / 650) - LEAST("height", 1000) / 2)),
  "width" = LEAST("width", 700),
  "height" = LEAST("height", 1000),
  "version" = "version" + 1;

UPDATE "FloorElement"
SET
  "x" = LEAST(700 - LEAST("width", 700), GREATEST(0, (("x" + "width" / 2) * 700 / 1100) - LEAST("width", 700) / 2)),
  "y" = LEAST(1000 - LEAST("height", 1000), GREATEST(0, (("y" + "height" / 2) * 1000 / 650) - LEAST("height", 1000) / 2)),
  "width" = LEAST("width", 700),
  "height" = LEAST("height", 1000),
  "version" = "version" + 1;
