from PIL import Image
import os
import math

def create_image_mosaic(image_folder, output_file, image_size, images_per_row):
    """
    Crea un mosaico de imágenes.
    :param image_folder: Ruta a la carpeta con imágenes.
    :param output_file: Ruta del archivo de salida (ej: 'mosaic.jpg').
    :param image_size: Tamaño de cada imagen en píxeles (ancho, alto).
    :param images_per_row: Cantidad de imágenes por fila.
    """
    # Listar todas las imágenes en la carpeta
    image_files = [f for f in os.listdir(image_folder) if f.lower().endswith(('png', 'jpg', 'jpeg'))]

    # Calcular filas y columnas
    num_images = len(image_files)
    rows = math.ceil(num_images / images_per_row)
    mosaic_width = image_size[0] * images_per_row
    mosaic_height = image_size[1] * rows

    # Crear imagen base
    mosaic = Image.new('RGB', (mosaic_width, mosaic_height), (0, 0, 0))  # Fondo negro

    # Insertar imágenes
    x_offset = 0
    y_offset = 0
    for idx, image_file in enumerate(image_files):
        img_path = os.path.join(image_folder, image_file)
        img = Image.open(img_path).resize(image_size)  # Redimensionar cada imagen al tamaño deseado
        mosaic.paste(img, (x_offset, y_offset))

        # Ajustar posiciones
        x_offset += image_size[0]
        if (idx + 1) % images_per_row == 0:
            x_offset = 0
            y_offset += image_size[1]

    # Guardar el mosaico
    mosaic.save(output_file)
    print(f"Mosaico guardado en: {output_file}")

# Configuración
image_folder = '/home/cristian/Projects/MuniCS/sprites-as-a-service-master/backend/generated_images'  # Cambia esto a tu carpeta
output_file = 'mosaic.jpg'
image_size = (180, 180)  # Tamaño de cada imagen (ancho, alto)
images_per_row = 33  # Número de imágenes por fila

# Crear mosaico
create_image_mosaic(image_folder, output_file, image_size, images_per_row)
