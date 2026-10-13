# Mosque Carpool — Railway deploy (PHP 8.2 + Apache + MySQL driver)
FROM php:8.2-apache

# Apache must run exactly ONE MPM; mod_php needs prefork.
# (Some base-image variants ship a second MPM enabled, which
# crashes Apache with "More than one MPM loaded".)
RUN a2dismod mpm_event mpm_worker 2>/dev/null || true; \
    a2enmod mpm_prefork 2>/dev/null || true; \
    docker-php-ext-install pdo pdo_mysql

COPY . /var/www/html/

# Railway assigns $PORT at container start — point Apache at it.
CMD sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf && \
    sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf && \
    apache2-foreground
