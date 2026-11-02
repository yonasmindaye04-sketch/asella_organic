import os
import zipfile
import sys

def make_zip(source_dir, output_zip, exclude_exts=('.zip',), exclude_names=('.htaccess',)):
    if not os.path.exists(source_dir):
        print(f"Error: source directory does not exist: {source_dir}")
        sys.exit(1)

    if os.path.exists(output_zip):
        os.remove(output_zip)

    count = 0
    with zipfile.ZipFile(output_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                if any(file.endswith(ext) for ext in exclude_exts):
                    continue
                if file in exclude_names:
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, source_dir).replace('\\', '/')
                zf.write(full_path, rel_path)
                count += 1

    size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"Created {output_zip}: {count} files ({size_mb:.2f} MB)")

if __name__ == '__main__':
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    frontend_dist = os.path.join(root_dir, 'frontend', 'dist')
    backend_dist = os.path.join(root_dir, 'backend', 'dist')

    frontend_zip = os.path.join(root_dir, 'frontend-dist.zip')
    backend_zip = os.path.join(root_dir, 'backend-dist.zip')

    print("Packaging deployment archives...")
    make_zip(frontend_dist, frontend_zip, exclude_exts=('.zip',), exclude_names=('.htaccess',))
    make_zip(backend_dist, backend_zip, exclude_exts=('.zip',), exclude_names=())
    print("Done! All archives are clean and standard.")
