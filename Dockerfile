# Mosque Carpool — Railway deploy (PHP 8.2 + Apache + MySQL driver)
FROM php:8.2-apache

RUN a2enmod rewrite && docker-php-ext-install pdo pdo_mysql

COPY . /var/www/html/

# Railway assigns $PORT at container start — point Apache at it.
# Also force exactly ONE MPM (prefork, required by mod_php) here at
# RUNTIME: this image restores mpm_event after build time, so the
# cleanup must happen immediately before Apache starts.
CMD rm -f /etc/apache2/mods-enabled/mpm_event.load \
          /etc/apache2/mods-enabled/mpm_event.conf \
          /etc/apache2/mods-enabled/mpm_worker.load \
          /etc/apache2/mods-enabled/mpm_worker.conf; \
    sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf && \
    sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf && \
    apache2-foreground
